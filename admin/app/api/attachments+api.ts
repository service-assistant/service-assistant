import { serverApiUrl } from '../../src/config/serverApi';

const ATTACHMENTS_URL = serverApiUrl("api/attachments");

type AttachmentResponse = {
  id: number;
  file_global_path?: string;
  original_filename: string;
  created_at: string;
  updated_at?: string;
};

type DeviceResponse = {
  id: number;
  name: string;
  model_serial_code?: string;
  image_url?: string;
  brand_id?: number;
  device_type_id?: number;
  created_at?: string;
  updated_at?: string;
};

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
    response = await fetch(ATTACHMENTS_URL, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieznany blad polaczenia ze staging API.";
    return jsonResponse({ detail: `Nie moge pobrac dokumentow ze staging API: ${message}` }, 502);
  }

  if (!response.ok) {
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") ?? "application/json"
      }
    });
  }

  const attachments = (await response.json()) as AttachmentResponse[];
  const attachmentsWithDevices = await Promise.all(
    attachments.map(async (attachment) => {
      try {
        const devicesResponse = await fetch(`${ATTACHMENTS_URL}/${attachment.id}/devices`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!devicesResponse.ok) {
          return { ...attachment, devices: [] as DeviceResponse[] };
        }

        return {
          ...attachment,
          devices: (await devicesResponse.json()) as DeviceResponse[]
        };
      } catch {
        return { ...attachment, devices: [] as DeviceResponse[] };
      }
    })
  );

  return Response.json(attachmentsWithDevices);
}

export async function POST(request: Request) {
  const token = readAuthToken();

  if (!token) {
    return jsonResponse({ detail: "Brak AUTH_TOKEN w procesie Expo. Zrestartuj dev server po zmianie .env." }, 500);
  }

  let formData: unknown;

  try {
    formData = await request.formData();
  } catch {
    return jsonResponse({ detail: "Nieprawidlowe dane formularza." }, 400);
  }

  let response: Response;

  try {
    response = await fetch(ATTACHMENTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData as BodyInit
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieznany blad polaczenia ze staging API.";
    return jsonResponse({ detail: `Nie moge utworzyc dokumentu w staging API: ${message}` }, 502);
  }

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/json"
    }
  });
}
