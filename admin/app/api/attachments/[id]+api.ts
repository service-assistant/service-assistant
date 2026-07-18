import { serverApiUrl } from '../../../src/config/serverApi';

const ATTACHMENTS_URL = serverApiUrl("api/attachments");
const BRANDS_URL = serverApiUrl("api/brands");

function readAuthToken() {
  return process.env.AUTH_TOKEN ?? "";
}

function jsonResponse(body: { detail: string }, status: number) {
  return Response.json(body, { status });
}

async function fetchDevices(id: string, token: string) {
  try {
    const response = await fetch(`${ATTACHMENTS_URL}/${id}/devices`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
}

async function fetchBrandLogos(token: string) {
  try {
    const response = await fetch(BRANDS_URL, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) return new Map<number, string>();

    const brands = (await response.json()) as Array<{ id: number; logo_url?: string }>;

    return new Map(
      brands
        .filter((brand): brand is { id: number; logo_url: string } => Boolean(brand.logo_url))
        .map((brand) => [brand.id, brand.logo_url])
    );
  } catch {
    return new Map<number, string>();
  }
}

async function fetchFileSize(id: string, token: string) {
  try {
    const response = await fetch(`${ATTACHMENTS_URL}/${id}/file`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const contentLength = response.headers.get("Content-Length");

    response.body?.cancel();

    if (!response.ok || !contentLength) return undefined;

    const size = Number(contentLength);
    return Number.isFinite(size) && size > 0 ? size : undefined;
  } catch {
    return undefined;
  }
}

function getAttachmentId(request: Request) {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/\/api\/attachments\/([^/]+)/);
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
    response = await fetch(`${ATTACHMENTS_URL}/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieznany blad polaczenia ze staging API.";
    return jsonResponse({ detail: `Nie moge pobrac dokumentu ze staging API: ${message}` }, 502);
  }

  if (!response.ok) {
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") ?? "application/json"
      }
    });
  }

  const attachment = await response.json();
  const [devices, brandLogos, fileSizeBytes] = await Promise.all([fetchDevices(id, token), fetchBrandLogos(token), fetchFileSize(id, token)]);
  const devicesWithBrandLogos = devices.map((device: { brand_id?: number }) => ({
    ...device,
    brand_logo_url: device.brand_id ? brandLogos.get(device.brand_id) : undefined
  }));

  return Response.json({ ...attachment, devices: devicesWithBrandLogos, file_size_bytes: fileSizeBytes });
}

export async function DELETE(request: Request) {
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
    response = await fetch(`${ATTACHMENTS_URL}/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieznany blad polaczenia ze staging API.";
    return jsonResponse({ detail: `Nie moge usunac dokumentu ze staging API: ${message}` }, 502);
  }

  if (response.status === 204 || response.status === 205) {
    return new Response(null, {
      status: response.status
    });
  }

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/json"
    }
  });
}
