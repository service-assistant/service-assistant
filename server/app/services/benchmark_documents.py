import hashlib
import hmac
import logging
from pathlib import Path, PurePosixPath
from typing import Any
from datetime import datetime, timezone
from urllib.parse import quote, urlsplit
from xml.etree import ElementTree

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)

REQUIRED_CONFIGURATION = {
    "benchmark_r2_endpoint": "BENCHMARK_R2_ENDPOINT",
    "benchmark_r2_bucket": "BENCHMARK_R2_BUCKET",
    "benchmark_r2_access_key_id": "BENCHMARK_R2_ACCESS_KEY_ID",
    "benchmark_r2_secret_access_key": "BENCHMARK_R2_SECRET_ACCESS_KEY",
}


class BenchmarkStorageError(RuntimeError):
    """Raised when benchmark documents cannot be read from R2."""


def _missing_configuration(settings: Settings) -> list[str]:
    return [
        environment_name
        for field_name, environment_name in REQUIRED_CONFIGURATION.items()
        if not (value := getattr(settings, field_name)) or not str(value).strip()
    ]


def _documents_dir(settings: Settings) -> Path:
    return (
        settings.benchmark_documents_dir
        or settings.attachments_dir / ".benchmark_documents"
    )


def documents_dir(settings: Settings) -> Path:
    return _documents_dir(settings)


def _etag_path(document_path: Path) -> Path:
    return document_path.with_name(f".{document_path.name}.r2-etag")


def _normalized_prefix(settings: Settings) -> str:
    prefix = settings.benchmark_r2_prefix.strip().strip("/")
    return f"{prefix}/" if prefix else ""


def _signing_key(secret_key: str, date_stamp: str) -> bytes:
    date_key = hmac.new(
        f"AWS4{secret_key}".encode(), date_stamp.encode(), hashlib.sha256
    ).digest()
    region_key = hmac.new(date_key, b"auto", hashlib.sha256).digest()
    service_key = hmac.new(region_key, b"s3", hashlib.sha256).digest()
    return hmac.new(service_key, b"aws4_request", hashlib.sha256).digest()


def _signed_get_request(
    settings: Settings,
    object_key: str = "",
    query: dict[str, str] | None = None,
) -> tuple[str, dict[str, str]]:
    endpoint = urlsplit(str(settings.benchmark_r2_endpoint).rstrip("/"))
    if endpoint.scheme != "https" or not endpoint.netloc:
        raise BenchmarkStorageError("BENCHMARK_R2_ENDPOINT musi być adresem HTTPS.")

    bucket = str(settings.benchmark_r2_bucket)
    path_parts = [bucket, *PurePosixPath(object_key).parts] if object_key else [bucket]
    canonical_uri = "/" + "/".join(quote(part, safe="-_.~") for part in path_parts)
    query = query or {}
    canonical_query = "&".join(
        f"{quote(key, safe='-_.~')}={quote(value, safe='-_.~')}"
        for key, value in sorted(query.items())
    )

    now = datetime.now(timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")
    payload_hash = hashlib.sha256(b"").hexdigest()
    canonical_headers = (
        f"host:{endpoint.netloc}\n"
        f"x-amz-content-sha256:{payload_hash}\n"
        f"x-amz-date:{amz_date}\n"
    )
    signed_headers = "host;x-amz-content-sha256;x-amz-date"
    canonical_request = "\n".join(
        [
            "GET",
            canonical_uri,
            canonical_query,
            canonical_headers,
            signed_headers,
            payload_hash,
        ]
    )
    credential_scope = f"{date_stamp}/auto/s3/aws4_request"
    string_to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            amz_date,
            credential_scope,
            hashlib.sha256(canonical_request.encode()).hexdigest(),
        ]
    )
    signature = hmac.new(
        _signing_key(str(settings.benchmark_r2_secret_access_key), date_stamp),
        string_to_sign.encode(),
        hashlib.sha256,
    ).hexdigest()
    authorization = (
        "AWS4-HMAC-SHA256 "
        f"Credential={settings.benchmark_r2_access_key_id}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )
    url = f"{endpoint.scheme}://{endpoint.netloc}{canonical_uri}"
    if canonical_query:
        url = f"{url}?{canonical_query}"

    return url, {
        "Authorization": authorization,
        "x-amz-content-sha256": payload_hash,
        "x-amz-date": amz_date,
    }


def _signed_get(
    settings: Settings,
    object_key: str = "",
    query: dict[str, str] | None = None,
) -> httpx.Response:
    url, headers = _signed_get_request(settings, object_key, query)
    return httpx.get(url, headers=headers, timeout=120)


def _download_object(settings: Settings, object_key: str, destination: Path) -> None:
    url, headers = _signed_get_request(settings, object_key)
    with httpx.stream("GET", url, headers=headers, timeout=120) as response:
        response.raise_for_status()
        with destination.open("wb") as output:
            for chunk in response.iter_bytes():
                output.write(chunk)


def _relative_document_path(key: str, prefix: str) -> Path | None:
    if prefix and not key.startswith(prefix):
        return None

    relative_key = key[len(prefix) :] if prefix else key
    pure_path = PurePosixPath(relative_key)
    if (
        not relative_key
        or relative_key.endswith("/")
        or pure_path.is_absolute()
        or ".." in pure_path.parts
        or pure_path.suffix.lower() != ".pdf"
    ):
        return None
    return Path(*pure_path.parts)


def _list_remote_documents(settings: Settings) -> list[dict[str, Any]]:
    prefix = _normalized_prefix(settings)
    documents: list[dict[str, Any]] = []

    try:
        continuation_token: str | None = None
        while True:
            query = {"list-type": "2", "prefix": prefix}
            if continuation_token:
                query["continuation-token"] = continuation_token
            response = _signed_get(settings, query=query)
            response.raise_for_status()
            root = ElementTree.fromstring(response.content)
            namespace = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
            for item in root.findall("s3:Contents", namespace):
                key = item.findtext("s3:Key", default="", namespaces=namespace)
                relative_path = _relative_document_path(key, prefix)
                if relative_path is None:
                    continue
                documents.append(
                    {
                        "key": key,
                        "relative_path": relative_path,
                        "size": int(
                            item.findtext("s3:Size", default="0", namespaces=namespace)
                        ),
                        "etag": item.findtext(
                            "s3:ETag", default="", namespaces=namespace
                        ).strip('"'),
                    }
                )
            truncated = root.findtext(
                "s3:IsTruncated", default="false", namespaces=namespace
            )
            if truncated.lower() != "true":
                break
            continuation_token = root.findtext(
                "s3:NextContinuationToken", namespaces=namespace
            )
            if not continuation_token:
                raise BenchmarkStorageError(
                    "R2 nie zwrócił tokenu następnej strony dokumentów."
                )
    except (httpx.HTTPError, ElementTree.ParseError, ValueError) as exc:
        logger.warning("Could not list benchmark documents in R2", exc_info=True)
        raise BenchmarkStorageError(
            "Nie udało się odczytać listy dokumentów z Cloudflare R2. "
            "Sprawdź endpoint, bucket i uprawnienia tokenu."
        ) from exc

    return sorted(documents, key=lambda item: item["key"].lower())


def get_document_status(settings: Settings) -> dict[str, Any]:
    missing_configuration = _missing_configuration(settings)
    local_directory = _documents_dir(settings)
    if missing_configuration:
        return {
            "configured": False,
            "missing_configuration": missing_configuration,
            "bucket": settings.benchmark_r2_bucket,
            "prefix": _normalized_prefix(settings),
            "local_directory": str(local_directory),
            "total": 0,
            "ready": 0,
            "missing": 0,
            "outdated": 0,
            "documents": [],
        }

    documents = _list_remote_documents(settings)
    ready = 0
    missing = 0
    outdated = 0
    serialized_documents: list[dict[str, Any]] = []

    for document in documents:
        local_path = local_directory / document["relative_path"]
        if not local_path.is_file():
            state = "missing"
            missing += 1
        elif (
            local_path.stat().st_size != document["size"]
            or not _etag_path(local_path).is_file()
            or _etag_path(local_path).read_text(encoding="utf-8").strip()
            != document["etag"]
        ):
            state = "outdated"
            outdated += 1
        else:
            state = "ready"
            ready += 1

        serialized_documents.append(
            {
                "key": document["key"],
                "filename": document["relative_path"].as_posix(),
                "size": document["size"],
                "etag": document["etag"],
                "state": state,
            }
        )

    return {
        "configured": True,
        "missing_configuration": [],
        "bucket": settings.benchmark_r2_bucket,
        "prefix": _normalized_prefix(settings),
        "local_directory": str(local_directory),
        "total": len(documents),
        "ready": ready,
        "missing": missing,
        "outdated": outdated,
        "documents": serialized_documents,
    }


def download_missing_documents(settings: Settings) -> dict[str, Any]:
    missing_configuration = _missing_configuration(settings)
    if missing_configuration:
        raise BenchmarkStorageError(
            "Brakuje konfiguracji: " + ", ".join(missing_configuration)
        )

    documents = _list_remote_documents(settings)
    local_directory = _documents_dir(settings)
    local_directory.mkdir(parents=True, exist_ok=True)
    downloaded: list[str] = []

    for document in documents:
        destination = local_directory / document["relative_path"]
        etag_path = _etag_path(destination)
        if (
            destination.is_file()
            and destination.stat().st_size == document["size"]
            and etag_path.is_file()
            and etag_path.read_text(encoding="utf-8").strip() == document["etag"]
        ):
            continue

        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = destination.with_name(f".{destination.name}.part")
        temporary_path.unlink(missing_ok=True)

        try:
            _download_object(settings, document["key"], temporary_path)
            if temporary_path.stat().st_size != document["size"]:
                raise BenchmarkStorageError(
                    f"Pobrany plik ma nieprawidłowy rozmiar: {document['key']}"
                )
            temporary_path.replace(destination)
            etag_path.write_text(document["etag"], encoding="utf-8")
            downloaded.append(document["key"])
        except (httpx.HTTPError, OSError) as exc:
            temporary_path.unlink(missing_ok=True)
            logger.warning(
                "Could not download benchmark document %s",
                document["key"],
                exc_info=True,
            )
            raise BenchmarkStorageError(
                f"Nie udało się pobrać dokumentu: {document['key']}"
            ) from exc
        except BenchmarkStorageError:
            temporary_path.unlink(missing_ok=True)
            raise

    result = get_document_status(settings)
    result["downloaded"] = downloaded
    return result
