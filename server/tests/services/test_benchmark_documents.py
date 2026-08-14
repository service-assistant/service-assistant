from types import SimpleNamespace
from typing import cast

from app.config import Settings
from app.services import benchmark_documents


def _settings(tmp_path, **updates):
    values = {
        "attachments_dir": tmp_path,
        "benchmark_documents_dir": tmp_path / "benchmark",
        "benchmark_r2_endpoint": "https://example.r2.cloudflarestorage.com",
        "benchmark_r2_bucket": "benchmark-bucket",
        "benchmark_r2_access_key_id": "access-key",
        "benchmark_r2_secret_access_key": "secret-key",
        "benchmark_r2_prefix": "benchmark/v1",
    }
    values.update(updates)
    return SimpleNamespace(**values)


def test_status_should_report_missing_ready_and_outdated_documents(tmp_path, mocker):
    settings = _settings(tmp_path)
    local_directory = settings.benchmark_documents_dir
    local_directory.mkdir()
    (local_directory / "ready.pdf").write_bytes(b"ready")
    (local_directory / ".ready.pdf.r2-etag").write_text("one", encoding="utf-8")
    (local_directory / "outdated.pdf").write_bytes(b"old")
    mocker.patch(
        "app.services.benchmark_documents._list_remote_documents",
        return_value=[
            {
                "key": "benchmark/v1/ready.pdf",
                "relative_path": benchmark_documents.Path("ready.pdf"),
                "size": 5,
                "etag": "one",
            },
            {
                "key": "benchmark/v1/missing.pdf",
                "relative_path": benchmark_documents.Path("missing.pdf"),
                "size": 7,
                "etag": "two",
            },
            {
                "key": "benchmark/v1/outdated.pdf",
                "relative_path": benchmark_documents.Path("outdated.pdf"),
                "size": 8,
                "etag": "three",
            },
        ],
    )

    result = benchmark_documents.get_document_status(cast(Settings, settings))

    assert result["ready"] == 1
    assert result["missing"] == 1
    assert result["outdated"] == 1
    assert [document["state"] for document in result["documents"]] == [
        "ready",
        "missing",
        "outdated",
    ]


def test_status_should_list_missing_configuration_without_contacting_r2(
    tmp_path, mocker
):
    settings = _settings(tmp_path, benchmark_r2_secret_access_key=None)
    remote_list = mocker.patch(
        "app.services.benchmark_documents._list_remote_documents"
    )

    result = benchmark_documents.get_document_status(cast(Settings, settings))

    assert result["configured"] is False
    assert result["missing_configuration"] == ["BENCHMARK_R2_SECRET_ACCESS_KEY"]
    remote_list.assert_not_called()


def test_download_should_only_fetch_missing_or_outdated_documents(tmp_path, mocker):
    settings = _settings(tmp_path)
    local_directory = settings.benchmark_documents_dir
    local_directory.mkdir()
    (local_directory / "ready.pdf").write_bytes(b"ready")
    (local_directory / ".ready.pdf.r2-etag").write_text("one", encoding="utf-8")
    documents = [
        {
            "key": "benchmark/v1/ready.pdf",
            "relative_path": benchmark_documents.Path("ready.pdf"),
            "size": 5,
            "etag": "one",
        },
        {
            "key": "benchmark/v1/folder/missing.pdf",
            "relative_path": benchmark_documents.Path("folder/missing.pdf"),
            "size": 7,
            "etag": "two",
        },
    ]
    mocker.patch(
        "app.services.benchmark_documents._list_remote_documents",
        return_value=documents,
    )

    def fake_download(_settings, _object_key, destination):
        destination.write_bytes(b"missing")

    download_object = mocker.patch(
        "app.services.benchmark_documents._download_object",
        side_effect=fake_download,
    )

    result = benchmark_documents.download_missing_documents(cast(Settings, settings))

    assert download_object.call_count == 1
    assert download_object.call_args.args[1] == "benchmark/v1/folder/missing.pdf"
    assert (local_directory / "folder/missing.pdf").read_bytes() == b"missing"
    assert result["ready"] == 2
    assert result["downloaded"] == ["benchmark/v1/folder/missing.pdf"]


def test_relative_path_should_reject_traversal_and_non_pdf_files():
    prefix = "benchmark/v1/"

    assert benchmark_documents._relative_document_path(
        "benchmark/v1/folder/manual.pdf", prefix
    ) == benchmark_documents.Path("folder/manual.pdf")
    assert (
        benchmark_documents._relative_document_path(
            "benchmark/v1/../secret.pdf", prefix
        )
        is None
    )
    assert (
        benchmark_documents._relative_document_path("benchmark/v1/notes.txt", prefix)
        is None
    )
