from pathlib import Path


TEMPLATES_DIR = Path(__file__).parents[2] / "app" / "templates" / "admin"


def test_upload_form_should_not_be_processed_by_global_submit_handler():
    base_template = (TEMPLATES_DIR / "base.html").read_text(encoding="utf-8")
    documents_template = (TEMPLATES_DIR / "documents.html").read_text(encoding="utf-8")

    assert 'data-submit-handler="custom"' in documents_template
    assert 'action="/admin/documents/upload-batches"' in documents_template
    assert 'name="files"' in documents_template
    assert "if (form.dataset.submitHandler === 'custom') return;" in base_template
    assert (
        "document.getElementById('upload-form').addEventListener('submit'"
        in documents_template
    )
    assert "document.addEventListener('submit'" not in documents_template
    assert "localStorage.setItem('admin_upload_batch_id'" in documents_template
    assert "monitorServerBatch(savedBatchId)" in documents_template
