"""TruthLayer AI: bounded, DNS-pinned public HTML retrieval.

Security notes:
- Every HTTP(S) connection uses a validated *resolved IP*, while retaining the
  original hostname for the Host header, TLS SNI and certificate verification.
- Redirects are checked independently.
- A lightweight per-process rate limit is included. For multi-instance production,
  also configure a shared rate limiter or edge/WAF limits.
"""
import http.client
import ipaddress
import logging
import re
import socket
import ssl
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/evidence", tags=["Evidence Retrieval"])
logger = logging.getLogger("truthlayer.evidence")

MAX_BYTES = 1_000_000
MAX_PASSAGES = 5
MAX_REDIRECTS = 3
TIMEOUT_SECONDS = 10
MAX_HTML_ELEMENTS = 100_000
RATE_LIMIT_REQUESTS = 12
RATE_LIMIT_WINDOW_SECONDS = 60
_rate_lock = threading.Lock()
_rate_hits: dict[str, deque[float]] = defaultdict(deque)


class RetrievalRequest(BaseModel):
    url: str = Field(min_length=10, max_length=2048)
    claim: str = Field(min_length=5, max_length=3000)


class EvidencePassage(BaseModel):
    text: str
    relevance_score: float


class RetrievalResult(BaseModel):
    url: str
    title: str
    publisher: str
    publication_date: str | None
    retrieved_at: str
    passages: list[EvidencePassage]
    retrieval_status: str
    verification_note: str


def _resolve_public_ips(hostname: str, port: int) -> list[str]:
    try:
        addresses = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except (socket.gaierror, UnicodeError, OSError):
        raise ValueError("Source hostname could not be resolved.") from None
    if not addresses:
        raise ValueError("Source hostname could not be resolved.")
    ips = []
    for address in addresses:
        try:
            ip = ipaddress.ip_address(address[4][0])
        except ValueError:
            raise ValueError("Source resolved to an invalid address.") from None
        if not ip.is_global:
            raise ValueError("Private, reserved, or local network destinations are blocked.")
        if str(ip) not in ips:
            ips.append(str(ip))
    return ips


def _validate_and_resolve(url: str) -> tuple[str, str, int, str, list[str]]:
    try:
        parsed = urlparse(url)
        port = parsed.port
    except ValueError:
        raise ValueError("Invalid source URL or port.") from None
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Only HTTP and HTTPS URLs are supported.")
    if not parsed.hostname:
        raise ValueError("A valid hostname is required.")
    if parsed.username is not None or parsed.password is not None or "@" in parsed.netloc:
        raise ValueError("URLs containing credentials are not supported.")
    if "\\" in url or any(ord(c) < 32 or ord(c) == 127 for c in url):
        raise ValueError("Invalid characters in source URL.")
    if port not in (None, 80, 443):
        raise ValueError("Only standard HTTP/HTTPS ports are supported.")
    hostname = parsed.hostname.lower().rstrip(".")
    if not hostname or hostname == "localhost" or hostname.endswith(".localhost"):
        raise ValueError("Localhost URLs are blocked.")
    if hostname.endswith((".local", ".internal", ".test", ".invalid", ".onion")):
        raise ValueError("Private or reserved hostnames are blocked.")
    if "%" in hostname:
        raise ValueError("Encoded hostnames are not supported.")
    effective_port = port or (443 if parsed.scheme == "https" else 80)
    ips = _resolve_public_ips(hostname, effective_port)
    path = parsed.path or "/"
    if parsed.query:
        path += "?" + parsed.query
    return parsed.scheme, hostname, effective_port, path, ips


def validate_url(url: str) -> str:
    """Validate a public URL; connection pinning happens in retrieve_page."""
    _validate_and_resolve(url)
    return url


class _PinnedHTTPConnection(http.client.HTTPConnection):
    """Connect to a validated IP, not a second DNS resolution."""
    def __init__(self, hostname: str, port: int, pinned_ip: str):
        super().__init__(hostname, port, timeout=TIMEOUT_SECONDS)
        self.pinned_ip = pinned_ip

    def connect(self):
        self.sock = socket.create_connection(
            (self.pinned_ip, self.port), timeout=self.timeout
        )


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, hostname: str, port: int, pinned_ip: str):
        super().__init__(
            hostname, port, timeout=TIMEOUT_SECONDS,
            context=ssl.create_default_context()
        )
        self.pinned_ip = pinned_ip

    def connect(self):
        raw_socket = socket.create_connection(
            (self.pinned_ip, self.port), timeout=self.timeout
        )
        try:
            # self.host is the ORIGINAL hostname: verifies TLS identity and SNI.
            self.sock = self._context.wrap_socket(raw_socket, server_hostname=self.host)
        except BaseException:
            raw_socket.close()
            raise


def score_passage(passage: str, claim: str) -> float:
    claim_words = set(re.findall(r"[a-zA-Z]{4,}", claim.lower()))
    if not claim_words:
        return 0.0
    passage_words = set(re.findall(r"[a-zA-Z]{4,}", passage.lower()))
    return round(len(claim_words & passage_words) / len(claim_words), 3)


def extract_content(html: str, claim: str):
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    for element in soup(["script", "style", "nav", "footer", "header", "noscript"]):
        element.decompose()
    unique = {}
    for element in soup.select("article p, main p, p, li")[:MAX_HTML_ELEMENTS]:
        text = " ".join(element.get_text(" ", strip=True).split())
        if len(text) < 45:
            continue
        text = text[:1200]
        if text not in unique:
            unique[text] = EvidencePassage(
                text=text, relevance_score=score_passage(text, claim)
            )
    ranked = sorted(unique.values(), key=lambda item: item.relevance_score, reverse=True)
    return title, ranked[:MAX_PASSAGES]


def extract_publication_date(html: str) -> str | None:
    soup = BeautifulSoup(html, "html.parser")
    for attrs in (
        {"property": "article:published_time"},
        {"name": "date"},
        {"name": "pubdate"},
        {"itemprop": "datePublished"},
    ):
        tag = soup.find("meta", attrs=attrs)
        if tag and tag.get("content"):
            return str(tag["content"])[:40]
    return None


def _fetch_once(url: str) -> tuple[int, dict[str, str], bytes]:
    scheme, hostname, port, path, ips = _validate_and_resolve(url)
    # Every attempted connection uses a pre-validated IP. No DNS lookup occurs
    # inside the connection, including on a retry.
    last_error = None
    for ip in ips:
        conn = (
            _PinnedHTTPSConnection(hostname, port, ip)
            if scheme == "https"
            else _PinnedHTTPConnection(hostname, port, ip)
        )
        try:
            host_header = hostname if port == (443 if scheme == "https" else 80) else f"{hostname}:{port}"
            conn.request(
                "GET", path,
                headers={
                    "Host": host_header,
                    "User-Agent": "TruthLayerAI-EvidenceResearch/1.2",
                    "Accept": "text/html",
                    "Accept-Encoding": "identity",
                    "Connection": "close",
                },
            )
            response = conn.getresponse()
            headers = {k.lower(): v for k, v in response.getheaders()}
            # Bound response size even if Content-Length is missing or misleading.
            if int(headers.get("content-length", "0")) > MAX_BYTES:
                raise ValueError("Source exceeds the maximum permitted size.")
            body = response.read(MAX_BYTES + 1)
            if len(body) > MAX_BYTES:
                raise ValueError("Source exceeds the maximum permitted size.")
            return response.status, headers, body
        except (OSError, ssl.SSLError, http.client.HTTPException) as exc:
            last_error = exc
        finally:
            conn.close()
    logger.info("Public source fetch failed: %s", type(last_error).__name__)
    raise ValueError("The source could not be retrieved.")


def retrieve_page(url: str) -> tuple[str, str]:
    current_url = url
    for redirect_count in range(MAX_REDIRECTS + 1):
        status, headers, body = _fetch_once(current_url)
        if status in (301, 302, 303, 307, 308):
            location = headers.get("location")
            if not location:
                raise ValueError("The source returned an invalid redirect.")
            if redirect_count >= MAX_REDIRECTS:
                raise ValueError("The source redirected too many times.")
            current_url = urljoin(current_url, location)
            continue
        if status >= 400:
            raise ValueError(f"Source returned HTTP {status}.")
        if not (200 <= status < 300):
            raise ValueError(f"Unexpected source HTTP status {status}.")
        if "text/html" not in headers.get("content-type", "").lower():
            raise ValueError("Only HTML pages are supported.")
        if headers.get("content-encoding", "identity").lower() not in ("", "identity"):
            raise ValueError("Compressed source responses are not supported.")
        charset = "utf-8"
        content_type = headers.get("content-type", "")
        match = re.search(r"charset\s*=\s*['\"]?([a-zA-Z0-9._-]+)", content_type, re.I)
        if match:
            charset = match.group(1)
        try:
            html = body.decode(charset, errors="replace")
        except LookupError:
            html = body.decode("utf-8", errors="replace")
        return html, current_url
    raise ValueError("The source redirected too many times.")


def _enforce_rate_limit(client_ip: str):
    now = time.monotonic()
    with _rate_lock:
        # Bound retained keys by expiring inactive clients.
        if len(_rate_hits) > 10_000:
            for key in list(_rate_hits):
                if not _rate_hits[key] or now - _rate_hits[key][-1] > RATE_LIMIT_WINDOW_SECONDS:
                    del _rate_hits[key]
        hits = _rate_hits[client_ip]
        while hits and now - hits[0] >= RATE_LIMIT_WINDOW_SECONDS:
            hits.popleft()
        if len(hits) >= RATE_LIMIT_REQUESTS:
            raise HTTPException(
                status_code=429,
                detail="Too many retrieval requests. Please try again in a minute.",
                headers={"Retry-After": "60"},
            )
        hits.append(now)


@router.post("/retrieve", response_model=RetrievalResult)
def retrieve_evidence(request: RetrievalRequest, http_request: Request):
    # Use the actual ASGI client address; do not trust spoofable forwarded headers.
    client_ip = http_request.client.host if http_request.client else "unknown"
    _enforce_rate_limit(client_ip)
    try:
        html, final_url = retrieve_page(request.url)
        title, passages = extract_content(html, request.claim)
        hostname = urlparse(final_url).hostname or ""
        return RetrievalResult(
            url=final_url,
            title=title or hostname,
            publisher=hostname,
            publication_date=extract_publication_date(html),
            retrieved_at=datetime.now(timezone.utc).isoformat(),
            passages=passages,
            retrieval_status="retrieved",
            verification_note=(
                "Source content was retrieved but not independently authenticated "
                "or fact-checked. Relevance scores measure keyword overlap, "
                "not factual support."
            ),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except Exception:
        logger.exception("Unexpected evidence retrieval failure")
        raise HTTPException(
            status_code=502, detail="Evidence retrieval failed unexpectedly."
        ) from None
