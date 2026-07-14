def get_device_document_language(device_id: int) -> str:
    """Return the primary language of documents linked to a device.

    This is currently a hard-coded mock: every document is treated as
    English. In the future it will read the language from attachment
    metadata.
    """
    _ = device_id
    return "en"
