import { serverApiUrl } from '../../../../src/config/serverApi';

const ATTACHMENTS_URL = serverApiUrl("api/attachments");

function readAuthToken() {
  return process.env.AUTH_TOKEN ?? "";
}

function jsonResponse(body: { detail: string }, status: number) {
  return Response.json(body, { status });
}

function getAttachmentId(request: Request) {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/\/api\/attachments\/([^/]+)\/file/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export async function GET(request: Request) {
  const token = readAuthToken();
  const id = getAttachmentId(request);

  if (!token) {
    return jsonResponse({ detail: "Brak AUTH_TOKEN w procesie Expo. Zrestartuj dev server po zmianie .env." }, 500);
  }

  if (!id) {
    return jsonResponse({ detail: "Brak ID dokumentu w adresie requestu." }, 400);
  }

  let response: Response;

  try {
    response = await fetch(`${ATTACHMENTS_URL}/${id}/file`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieznany blad polaczenia ze staging API.";
    return jsonResponse({ detail: `Nie moge pobrac pliku ze staging API: ${message}` }, 502);
  }

  if (!response.ok) {
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") ?? "application/json"
      }
    });
  }

  const headers = new Headers({
    "Accept-Ranges": response.headers.get("Accept-Ranges") ?? "bytes",
    "Content-Disposition": (response.headers.get("Content-Disposition") ?? "inline").replace(/^attachment/i, "inline"),
    "Content-Type": response.headers.get("Content-Type") ?? "application/pdf"
  });
  const contentLength = response.headers.get("Content-Length");

  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }

  return new Response(response.body, {
    status: response.status,
    headers
  });
}
