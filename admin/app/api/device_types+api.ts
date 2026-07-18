import { serverApiUrl } from '../../src/config/serverApi';

const DEVICE_TYPES_URL = serverApiUrl("api/device_types");

function readAuthToken() {
  return process.env.AUTH_TOKEN ?? "";
}

function jsonResponse(body: { detail: string }, status: number) {
  return Response.json(body, { status });
}

export async function GET() {
  const token = readAuthToken();

  if (!token) {
    return jsonResponse({ detail: "Brak AUTH_TOKEN w procesie Expo. Zrestartuj dev server po zmianie .env." }, 500);
  }

  let response: Response;

  try {
    response = await fetch(DEVICE_TYPES_URL, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieznany blad polaczenia ze staging API.";
    return jsonResponse({ detail: `Nie moge pobrac typow maszyn ze staging API: ${message}` }, 502);
  }

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/json"
    }
  });
}

export async function POST(request: Request) {
  const token = readAuthToken();

  if (!token) {
    return jsonResponse({ detail: "Brak AUTH_TOKEN w procesie Expo. Zrestartuj dev server po zmianie .env." }, 500);
  }

  let body: string;

  try {
    body = JSON.stringify(await request.json());
  } catch {
    return jsonResponse({ detail: "Nieprawidlowy JSON w request body." }, 400);
  }

  let response: Response;

  try {
    response = await fetch(DEVICE_TYPES_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieznany blad polaczenia ze staging API.";
    return jsonResponse({ detail: `Nie moge utworzyc typu maszyny w staging API: ${message}` }, 502);
  }

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/json"
    }
  });
}
