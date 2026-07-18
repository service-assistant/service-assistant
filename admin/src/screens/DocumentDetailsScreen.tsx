import { router, useLocalSearchParams } from "expo-router";
import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { Image, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdminSidebar } from "../components/AdminSidebar";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Download,
  FileCog,
  FileText,
  Hammer,
  type LucideIcon,
  ScrollText,
  ShieldAlert,
  Trash2,
  Workflow,
  ZoomIn,
  ZoomOut
} from "lucide-react-native";
import Constants from "expo-constants";
import { apiUrl } from "../config/api";
import { loadPdfDocument } from "../utils/loadPdfDocument";
import type { PdfDocumentProxy, PdfPageProxy } from "../utils/pdfTypes";

const ATTACHMENTS_URL = apiUrl("api/attachments");
const DELETE_CONFIRMATION_PHRASE = "tak, usuń";
const AUTH_TOKEN =
  ((Constants.expoConfig?.extra as { authToken?: string } | undefined)?.authToken) ??
  process.env.AUTH_TOKEN ??
  process.env.EXPO_PUBLIC_AUTH_TOKEN ??
  "";

type DeviceResponse = {
  id: number;
  name: string;
  brand_logo_url?: string;
  model_serial_code?: string;
  image_url?: string;
};

type DocumentCategory = "Instrukcja" | "Kody błędów" | "Schemat" | "Biuletyn";

type AttachmentDetails = {
  id: number;
  file_global_path?: string;
  file_size?: number;
  file_size_bytes?: number;
  original_filename: string;
  size?: number;
  created_at: string;
  updated_at?: string;
  devices?: DeviceResponse[];
};

const documentCategoryStyles: Record<DocumentCategory, { icon: LucideIcon; color: string }> = {
  Instrukcja: {
    icon: ScrollText,
    color: "#8ed7ff"
  },
  "Kody błędów": {
    icon: ShieldAlert,
    color: "#A78BFA"
  },
  Schemat: {
    icon: Workflow,
    color: "#a7f3d0"
  },
  Biuletyn: {
    icon: FileCog,
    color: "#d7c7ff"
  }
};

function getStringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getDetailsUrl(id: string) {
  return Platform.OS === "web" ? `/api/attachments/${encodeURIComponent(id)}` : `${ATTACHMENTS_URL}/${encodeURIComponent(id)}`;
}

function getFileUrl(id: string) {
  return Platform.OS === "web" ? `/api/attachments/${encodeURIComponent(id)}/file` : `${ATTACHMENTS_URL}/${encodeURIComponent(id)}/file`;
}

function getFetchHeaders() {
  return Platform.OS === "web" ? undefined : { Authorization: `Bearer ${AUTH_TOKEN}` };
}

function formatDate(value?: string) {
  if (!value) return "Brak danych";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getDocumentType(filename?: string) {
  const extension = filename?.split(".").pop()?.toUpperCase();
  return extension ?? "Dokument";
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getDocumentCategory(filename: string): DocumentCategory {
  const normalizedName = normalizeText(filename);

  if (/(kod|blad|bled|error|fault|alarm)/.test(normalizedName)) {
    return "Kody błędów";
  }

  if (/(schemat|diagram|schema|wiring|hydraulic|electric)/.test(normalizedName)) {
    return "Schemat";
  }

  if (/(biuletyn|bulletin|news|aktualizacja|zmiana)/.test(normalizedName)) {
    return "Biuletyn";
  }

  return "Instrukcja";
}

function formatBytes(size?: number) {
  if (!size) return "Brak danych";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getAttachmentSize(attachment: AttachmentDetails) {
  return attachment.file_size_bytes ?? attachment.file_size ?? attachment.size;
}

function getMachineUsageLabel(count: number) {
  if (count === 1) return "1 maszyna";
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  const suffix = lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14) ? "maszyny" : "maszyn";
  return `${count} ${suffix}`;
}

async function fetchDevicesForAttachment(id: string) {
  const response = await fetch(`${ATTACHMENTS_URL}/${encodeURIComponent(id)}/devices`, {
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`
    }
  });

  if (!response.ok) return [] as DeviceResponse[];
  return (await response.json()) as DeviceResponse[];
}

async function fetchAttachmentDetails(id: string) {
  const response = await fetch(getDetailsUrl(id), {
    headers: getFetchHeaders()
  });

  if (!response.ok) {
    let detail: string | undefined;

    try {
      const errorBody = (await response.json()) as { detail?: string };
      detail = errorBody.detail;
    } catch {}

    throw new Error(detail ?? `Nie udało się pobrać dokumentu (${response.status}).`);
  }

  const attachment = (await response.json()) as AttachmentDetails;

  if (Platform.OS !== "web") {
    attachment.devices = await fetchDevicesForAttachment(id);
  }

  return attachment;
}

async function deleteAttachment(id: string) {
  const response = await fetch(getDetailsUrl(id), {
    method: "DELETE",
    headers: getFetchHeaders()
  });

  if (!response.ok) {
    let detail: string | undefined;

    try {
      detail = ((await response.clone().json()) as { detail?: string }).detail;
    } catch {
      detail = await response.text().catch(() => undefined);
    }

    throw new Error(detail ?? `Nie udało się usunąć dokumentu (${response.status}).`);
  }
}

function PdfCanvasPage({ pageNumber, pdf, zoom }: { pageNumber: number; pdf: PdfDocumentProxy; zoom: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: ReturnType<PdfPageProxy["render"]> | undefined;

    pdf.getPage(pageNumber)
      .then((page) => {
        if (cancelled) return;

        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");

        if (!canvas || !context) return;

        const viewport = page.getViewport({ scale: 1.2 * (zoom / 100) });
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        renderTask = page.render({ canvasContext: context, viewport });

        return renderTask.promise;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pageNumber, pdf, zoom]);

  return createElement(
    "div",
    {
      "data-pdf-page": pageNumber,
      style: {
        background: "#ffffff",
        boxShadow: "0 18px 40px rgba(0,0,0,0.32)",
        margin: "0 auto 18px",
        width: "fit-content"
      }
    },
    createElement("canvas", {
      ref: canvasRef,
      style: {
        display: "block"
      }
    })
  );
}

function PdfFallbackFrame({ fileUrl }: { fileUrl: string }) {
  if (Platform.OS !== "web") {
    return (
      <View className="h-full w-full items-center justify-center bg-[#0e161d] px-8">
        <FileText size={42} color="#ffb36f" />
        <Text className="mt-4 text-center text-[15px] font-semibold text-[#dfe6ef]">Podgląd PDF jest dostępny w wersji web.</Text>
      </View>
    );
  }

  return createElement("iframe", {
    src: `${fileUrl}#toolbar=0&navpanes=0`,
    title: "Podgląd dokumentu",
    style: {
      backgroundColor: "#101820",
      border: "0",
      height: "100%",
      width: "100%"
    }
  });
}

function PdfCanvasViewer({
  onPageChange,
  page,
  pdf,
  scrollTargetPage,
  shouldScrollToPage,
  zoom
}: {
  onPageChange: (page: number) => void;
  page: number;
  pdf?: PdfDocumentProxy;
  scrollTargetPage: number;
  shouldScrollToPage: boolean;
  zoom: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const suppressScrollSyncRef = useRef(false);
  const suppressScrollSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const userScrollSyncRef = useRef(false);
  const userScrollSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!pdf || !shouldScrollToPage) return;

    const pageElement = containerRef.current?.querySelector(`[data-pdf-page="${scrollTargetPage}"]`);
    pageElement?.scrollIntoView({ block: "start" });
  }, [pdf, scrollTargetPage, shouldScrollToPage]);

  useEffect(() => {
    suppressScrollSyncRef.current = true;

    if (suppressScrollSyncTimeoutRef.current) {
      clearTimeout(suppressScrollSyncTimeoutRef.current);
    }

    suppressScrollSyncTimeoutRef.current = setTimeout(() => {
      suppressScrollSyncRef.current = false;
    }, 650);

    return () => {
      if (suppressScrollSyncTimeoutRef.current) {
        clearTimeout(suppressScrollSyncTimeoutRef.current);
      }
    };
  }, [zoom]);

  useEffect(() => {
    return () => {
      if (userScrollSyncTimeoutRef.current) {
        clearTimeout(userScrollSyncTimeoutRef.current);
      }
    };
  }, []);

  function markUserScrollIntent() {
    userScrollSyncRef.current = true;

    if (userScrollSyncTimeoutRef.current) {
      clearTimeout(userScrollSyncTimeoutRef.current);
    }

    userScrollSyncTimeoutRef.current = setTimeout(() => {
      userScrollSyncRef.current = false;
    }, 900);
  }

  if (Platform.OS !== "web") {
    return (
      <View className="h-full w-full items-center justify-center bg-[#0e161d] px-8">
        <FileText size={42} color="#ffb36f" />
        <Text className="mt-4 text-center text-[15px] font-semibold text-[#dfe6ef]">Podgląd PDF jest dostępny w wersji web.</Text>
      </View>
    );
  }

  if (!pdf) {
    return createElement(
      "div",
      {
        style: {
          alignItems: "center",
          color: "#dfe6ef",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%"
        }
      },
      "Ładowanie podglądu PDF..."
    );
  }

  const pages = Array.from({ length: pdf.numPages }, (_, index) => index + 1);

  return createElement(
    "div",
    {
      ref: containerRef,
      onKeyDown: markUserScrollIntent,
      onPointerDown: markUserScrollIntent,
      onScroll: () => {
        const container = containerRef.current;
        if (!container || suppressScrollSyncRef.current || !userScrollSyncRef.current) return;

        const pageElements = Array.from(container.querySelectorAll("[data-pdf-page]")) as HTMLElement[];
        const containerTop = container.getBoundingClientRect().top;
        let closestPage = page;
        let closestDistance = Number.POSITIVE_INFINITY;

        pageElements.forEach((element) => {
          const distance = Math.abs(element.getBoundingClientRect().top - containerTop);

          if (distance < closestDistance) {
            closestDistance = distance;
            closestPage = Number(element.dataset.pdfPage ?? "1");
          }
        });

        if (closestPage !== page) {
          onPageChange(closestPage);
        }
      },
      onTouchStart: markUserScrollIntent,
      onWheel: markUserScrollIntent,
      style: {
        height: "100%",
        overflow: "auto",
        padding: "18px 20px",
        width: "100%"
      }
    },
    pages.map((pageNumber) => <PdfCanvasPage key={pageNumber} pageNumber={pageNumber} pdf={pdf} zoom={zoom} />)
  );
}

function PreviewCard({ fileUrl, filename }: { fileUrl: string; filename: string }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [pdf, setPdf] = useState<PdfDocumentProxy>();
  const [pdfError, setPdfError] = useState<string>();
  const [scrollTargetPage, setScrollTargetPage] = useState(1);
  const [shouldScrollToPage, setShouldScrollToPage] = useState(false);
  const [totalPages, setTotalPages] = useState<number>();
  const [zoom, setZoom] = useState(100);
  const categoryStyle = documentCategoryStyles[getDocumentCategory(filename)];
  const PreviewIcon = categoryStyle.icon;
  const page = Math.min(totalPages ?? Number.MAX_SAFE_INTEGER, Math.max(1, currentPage));
  const canZoomOut = zoom > 75;
  const canZoomIn = zoom < 200;

  useEffect(() => {
    let active = true;
    let loadedPdf: PdfDocumentProxy | undefined;

    if (Platform.OS !== "web") return;

    setPdf(undefined);
    setPdfError(undefined);

    loadPdfDocument(fileUrl)
      .then((document) => {
        if (!active || !document) return;

        loadedPdf = document as PdfDocumentProxy;
        setPdf(loadedPdf);
        setTotalPages(loadedPdf.numPages);
        setCurrentPage(1);
        setPageInput("1");
        setScrollTargetPage(1);
        setShouldScrollToPage(false);
      })
      .catch(() => {
        if (!active) return;
        setPdfError("Nie udało się załadować podglądu PDF.");
        setTotalPages(undefined);
      });

    return () => {
      active = false;
      loadedPdf?.destroy?.();
    };
  }, [fileUrl]);

  function zoomOut() {
    setZoom((current) => Math.max(75, current - 25));
  }

  function zoomIn() {
    setZoom((current) => Math.min(200, current + 25));
  }

  function updatePage(value: string) {
    const numericValue = value.replace(/\D/g, "");
    const nextPage = Math.min(totalPages ?? Number.MAX_SAFE_INTEGER, Math.max(1, Number.parseInt(numericValue, 10) || 1));
    setCurrentPage(nextPage);
    setPageInput(String(nextPage));
    setScrollTargetPage(nextPage);
    setShouldScrollToPage(true);
  }

  function syncPageFromScroll(nextPage: number) {
    setCurrentPage(nextPage);
    setPageInput(String(nextPage));
    setShouldScrollToPage(false);
  }

  return (
    <View className="min-h-0 flex-1 rounded-lg border border-[#2d3745] bg-[#171e27]">
      <View className="h-[53px] flex-row items-center justify-between border-b border-[#2d3745] px-5">
        <View className="flex-row items-center">
          <View className="h-[36px] w-[36px] items-center justify-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27]">
            <PreviewIcon size={21} color={categoryStyle.color} strokeWidth={2.3} />
          </View>
          <Text className="ml-3 text-[18px] font-medium text-[#dfe6ef]">Podgląd dokumentu</Text>
        </View>
        <View className="flex-row items-center gap-3">
          <View className="flex-row items-center">
            <Text className="mr-2 text-[12px] font-black uppercase tracking-[0.4px] text-[#9AA4B2]">Strona</Text>
            <TextInput
              className="h-8 w-14 rounded-md border border-[#2d3745] bg-[#0f161d] px-2 text-center text-[13px] font-black text-[#dfe6ef] outline-none"
              keyboardType="number-pad"
              value={pageInput}
              onChangeText={updatePage}
            />
            <Text className="ml-2 text-[12px] font-medium text-[#9AA4B2]">z {totalPages ?? "-"}</Text>
          </View>
          <Pressable
            className="h-8 flex-row items-center justify-center rounded-md border border-[#2d3745] bg-[#1a212b] px-3 hover:bg-[#222b36]"
            onPress={() => Linking.openURL(fileUrl)}
          >
            <Download size={13} color="#dbe3ee" />
            <Text className="ml-2 text-[11px] font-black text-[#dbe3ee]">Pobierz</Text>
          </Pressable>
        </View>
      </View>

      <View className="flex-1 bg-[#0e161d]">
        <View className="h-full w-full overflow-hidden bg-[#0e161d]">
          {pdfError ? (
            <PdfFallbackFrame fileUrl={fileUrl} />
          ) : (
            <PdfCanvasViewer
              onPageChange={syncPageFromScroll}
              page={page}
              pdf={pdf}
              scrollTargetPage={scrollTargetPage}
              shouldScrollToPage={shouldScrollToPage}
              zoom={zoom}
            />
          )}
        </View>

        <View
          className="absolute bottom-[20px] self-center flex-row items-center rounded-full bg-[#343d48] px-3 py-2"
          style={{ zIndex: 20, elevation: 20, userSelect: "none" } as unknown as ViewStyle}
        >
          <Pressable
            className={`h-8 w-8 items-center justify-center rounded-full ${canZoomOut ? "cursor-pointer hover:bg-[#46505d]" : "opacity-35"}`}
            disabled={!canZoomOut}
            onPress={zoomOut}
            style={{ userSelect: "none" } as unknown as ViewStyle}
          >
            <ZoomOut size={18} color="#dfe7f2" />
          </Pressable>
          <Text className="mx-3 w-11 text-center text-[12px] font-black text-[#dfe7f2]" selectable={false}>{zoom}%</Text>
          <Pressable
            className={`h-8 w-8 items-center justify-center rounded-full ${canZoomIn ? "cursor-pointer hover:bg-[#46505d]" : "opacity-35"}`}
            disabled={!canZoomIn}
            onPress={zoomIn}
            style={{ userSelect: "none" } as unknown as ViewStyle}
          >
            <ZoomIn size={18} color="#dfe7f2" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function StatusCard({ hasAssignedMachines }: { hasAssignedMachines: boolean }) {
  if (!hasAssignedMachines) {
    return (
      <View className="flex-row rounded-lg border border-[#8d540f] bg-[#3a2b1b] px-4 py-3">
        <View className="mr-4 h-9 w-9 items-center justify-center rounded-full bg-[#4a351d]">
          <AlertTriangle size={20} color="#FF7A00" strokeWidth={2.4} />
        </View>
        <View className="flex-1">
          <Text className="text-[12px] font-black uppercase tracking-[0.7px] text-[#FF921F]">Status: Wymaga przypisania</Text>
          <Text className="mt-1 text-[12px] font-medium leading-[17px] text-[#ffd18b]">
            Przypisz dokument do maszyny, aby Asystent mógł korzystać z tej wiedzy we właściwym kontekście.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-row rounded-lg border border-[#114d3d] bg-[#0d2b27] px-4 py-3">
      <View className="mr-4 h-9 w-9 items-center justify-center rounded-full bg-[#104b3b]">
        <CheckCircle2 size={20} color="#20e288" fill="#20e288" strokeWidth={2.4} />
      </View>
      <View className="flex-1">
        <Text className="text-[12px] font-black uppercase tracking-[0.7px] text-[#20e288]">Status: Gotowy do użycia</Text>
        <Text className="mt-1 text-[12px] font-medium leading-[17px] text-[#c5d4d1]">
          Dokument jest dostępny w bazie wiedzy i może być używany przez Asystenta.
        </Text>
      </View>
    </View>
  );
}

function FileInfoCard({ attachment }: { attachment: AttachmentDetails }) {
  return (
    <View className="rounded-lg border border-[#2d3745] bg-[#1a212b] px-5 py-5">
      <View className="mb-4">
        <Text className="text-[18px] font-medium text-[#dfe6ef]">Informacje o dokumencie</Text>
      </View>

      <InfoItem label="Nazwa dokumentu" value={attachment.original_filename} />
      <InfoItem label="Rodzaj" value={getDocumentCategory(attachment.original_filename)} />
      <InfoItem label="Data dodania" value={formatDate(attachment.created_at)} />
      <InfoItem label="Używane przez" value={getMachineUsageLabel(attachment.devices?.length ?? 0)} />
      <InfoItem label="Rozmiar" value={formatBytes(getAttachmentSize(attachment))} last />
    </View>
  );
}

function InfoLabel({ label }: { label: string }) {
  return <Text className="text-[11px] font-black tracking-[0.4px] text-[#c3cad5]">{label}</Text>;
}

function InfoItem({ label, last, value }: { label: string; last?: boolean; value: string }) {
  return (
    <View className={last ? "" : "mb-4"}>
      <InfoLabel label={label} />
      <Text numberOfLines={2} className="mt-1 text-[14px] font-medium leading-[19px] text-[#dfe6ef]">{value}</Text>
    </View>
  );
}

function RelatedMachineBrandLogo({ uri }: { uri: string }) {
  if (Platform.OS === "web") {
    return createElement("img", {
      alt: "",
      src: uri,
      style: {
        display: "block",
        height: 18,
        maxWidth: 112,
        objectFit: "contain",
        objectPosition: "left center",
        width: "auto"
      }
    });
  }

  return <Image source={{ uri }} className="h-[18px] max-w-[112px]" resizeMode="contain" />;
}

function RelatedMachinesCard({ documentId, devices }: { documentId: string; devices: DeviceResponse[] }) {
  return (
    <View className="rounded-lg border border-[#2d3745] bg-[#1a212b] px-5 py-5">
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="text-[18px] font-medium text-[#dfe6ef]">Powiązane maszyny</Text>
        <Pressable className="h-8 justify-center rounded-md px-2 hover:bg-[#222b36]" onPress={() => router.push(`/documents/${documentId}/machines`)}>
          <Text className="text-[12px] font-black text-[#ffb36f]">Zmień</Text>
        </Pressable>
      </View>
      <View className="gap-[10px]">
        {devices.length === 0 ? (
          <View className="h-[43px] flex-row items-center rounded-md border border-[#2d3745] bg-[#171e27] px-3">
            <Hammer size={19} color="#cfd6e0" />
            <Text className="ml-3 flex-1 text-[14px] font-medium text-[#dfe6ef]">Brak powiązanych maszyn</Text>
          </View>
        ) : null}

        {devices.map((device) => (
          <Pressable
            key={device.id}
            className="min-h-[66px] flex-row items-center rounded-md border border-[#2d3745] bg-[#171e27] px-3 py-2 hover:bg-[#222b36]"
            onPress={() => router.push(`/machines/${device.id}`)}
          >
            <View className="h-[46px] w-[58px] items-center justify-center overflow-hidden rounded border border-[#2d3745] bg-[#0c1219]">
              {device.image_url ? (
                <Image source={{ uri: device.image_url }} className="h-full w-full" resizeMode="cover" />
              ) : (
                <Hammer size={19} color="#cfd6e0" />
              )}
            </View>
            <View className="ml-3 min-w-0 flex-1 flex-row items-center">
              {device.brand_logo_url ? (
                <View className="mr-3 shrink-0 items-start justify-center">
                  <RelatedMachineBrandLogo uri={device.brand_logo_url} />
                </View>
              ) : null}
              <Text numberOfLines={1} className="min-w-0 flex-1 text-[14px] font-semibold text-[#dfe6ef]">{device.name}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function DangerActionsCard({ onDeletePress }: { onDeletePress: () => void }) {
  return (
    <View className="rounded-lg border border-[#4a2d31] bg-[#1a212b] px-5 py-5">
      <Text className="text-[18px] font-medium text-[#f4c3c0]">Strefa niebezpieczna</Text>
      <Text className="mt-1 text-[12px] font-medium leading-[17px] text-[#c9aaa5]">Trwałe działania dotyczące dokumentu.</Text>

      <Pressable className="mt-4 h-[45px] flex-row items-center justify-center rounded-md border border-[#f09a91] bg-transparent" onPress={onDeletePress}>
        <Trash2 size={15} color="#f09a91" />
        <Text className="ml-3 text-[12px] font-black text-[#f09a91]">Usuń dokument</Text>
      </Pressable>

      <View className="mt-3 flex-row items-start">
        <AlertTriangle size={14} color="#d7c9b4" />
        <Text className="ml-2 flex-1 text-[11px] font-medium leading-[15px] text-[#d7c9b4]">
          Po usunięciu asystent nie będzie już korzystał z tego dokumentu.
        </Text>
      </View>
    </View>
  );
}

function ConfirmationPhraseInput({ onChangeText, value }: { onChangeText: (value: string) => void; value: string }) {
  if (Platform.OS === "web") {
    return createElement("input", {
      autoComplete: "off",
      onChange: (event: { currentTarget: { value: string } }) => onChangeText(event.currentTarget.value),
      onCopy: (event: Event) => event.preventDefault(),
      onCut: (event: Event) => event.preventDefault(),
      onDrop: (event: Event) => event.preventDefault(),
      onPaste: (event: Event) => event.preventDefault(),
      spellCheck: false,
      style: {
        background: "#0f161d",
        border: "1px solid #4a2d31",
        borderRadius: 6,
        boxSizing: "border-box",
        color: "#f4c3c0",
        fontSize: 15,
        fontWeight: 700,
        height: 44,
        outline: "none",
        padding: "0 12px",
        width: "100%"
      },
      value
    });
  }

  return (
    <TextInput
      autoCorrect={false}
      className="h-11 rounded-md border border-[#4a2d31] bg-[#0f161d] px-3 text-[15px] font-bold text-[#f4c3c0]"
      contextMenuHidden
      onChangeText={onChangeText}
      value={value}
    />
  );
}

function DeleteDocumentConfirmationModal({
  documentName,
  deleteError,
  deleting,
  onCancel,
  onConfirm,
  onPhraseChange,
  phrase,
  visible
}: {
  documentName: string;
  deleteError?: string;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onPhraseChange: (value: string) => void;
  phrase: string;
  visible: boolean;
}) {
  const canConfirm = phrase.trim() === DELETE_CONFIRMATION_PHRASE && !deleting;

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-[rgba(0,0,0,0.68)] px-5">
        <View className="w-full max-w-[520px] rounded-lg border border-[#4a2d31] bg-[#1a212b] p-5">
          <View className="flex-row items-start">
            <View className="mr-4 h-10 w-10 items-center justify-center rounded-full bg-[#3b1719]">
              <AlertTriangle size={22} color="#f09a91" />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[20px] font-black text-[#f4c3c0]">Usunąć dokument?</Text>
              <Text className="mt-2 text-[13px] font-medium leading-[19px] text-[#c9aaa5]">
                Ta operacja jest trwała. Dokument zostanie usunięty z bazy wiedzy,{"\n"}
                a asystent nie będzie już mógł korzystać z jego treści.
              </Text>
            </View>
          </View>

          <View className="mt-5">
            <Text className="text-[12px] font-black uppercase tracking-[0.6px] text-[#d7c9b4]">Dokument:</Text>
            <Text numberOfLines={2} className="mt-2 text-[15px] font-semibold leading-[20px] text-[#dfe6ef]">{documentName}</Text>
          </View>

          <View className="mt-5">
            <Text className="text-[12px] font-black uppercase tracking-[0.6px] text-[#d7c9b4]">Wpisz frazę, aby potwierdzić:</Text>
            <Text className="mt-2 text-[14px] font-black text-[#f09a91]" selectable={false} style={{ userSelect: "none" } as unknown as ViewStyle}>
              {DELETE_CONFIRMATION_PHRASE}
            </Text>
            <View className="mt-3">
              <ConfirmationPhraseInput value={phrase} onChangeText={onPhraseChange} />
            </View>
          </View>

          {deleteError ? (
            <View className="mt-4 rounded-md border border-[#8d540f] bg-[#2a1d13] px-4 py-3">
              <Text className="text-[13px] font-black text-[#ffb36f]">{deleteError}</Text>
            </View>
          ) : null}

          <View className="mt-6 flex-row justify-end gap-3">
            <Pressable className="h-11 justify-center rounded-md border border-[#2d3745] px-5 hover:bg-[#222b36]" disabled={deleting} onPress={onCancel}>
              <Text className="text-[13px] font-black text-[#dbe3ee]">Anuluj</Text>
            </Pressable>
            <Pressable
              className={`h-11 flex-row items-center justify-center rounded-md px-5 ${canConfirm ? "bg-[#f09a91]" : "bg-[#4a2d31] opacity-45"}`}
              disabled={!canConfirm}
              onPress={onConfirm}
            >
              <Trash2 size={15} color="#111820" />
              <Text className="ml-2 text-[13px] font-black text-[#111820]">{deleting ? "Usuwanie..." : "Usuń dokument"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function DocumentDetailsScreen() {
  const params = useLocalSearchParams();
  const id = getStringParam(params.id);
  const [attachment, setAttachment] = useState<AttachmentDetails>();
  const [deleteError, setDeleteError] = useState<string>();
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deletePromptVisible, setDeletePromptVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;

    if (!id) {
      setError("Brak ID dokumentu.");
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchAttachmentDetails(id)
      .then((details) => {
        if (!active) return;
        setAttachment(details);
        setError(undefined);
      })
      .catch((fetchError: unknown) => {
        if (!active) return;
        setError(fetchError instanceof Error ? fetchError.message : "Nie udało się pobrać dokumentu.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  function openDeletePrompt() {
    setDeleteError(undefined);
    setDeletePhrase("");
    setDeletePromptVisible(true);
  }

  function closeDeletePrompt() {
    if (deleting) return;

    setDeleteError(undefined);
    setDeletePhrase("");
    setDeletePromptVisible(false);
  }

  async function confirmDeleteDocument() {
    if (!id || deletePhrase.trim() !== DELETE_CONFIRMATION_PHRASE) return;

    setDeleting(true);
    setDeleteError(undefined);

    try {
      await deleteAttachment(id);
      router.replace("/");
    } catch (deleteFailure) {
      setDeleteError(deleteFailure instanceof Error ? deleteFailure.message : "Nie udało się usunąć dokumentu.");
    } finally {
      setDeleting(false);
    }
  }

  const fileUrl = useMemo(() => (id ? getFileUrl(id) : ""), [id]);

  return (
    <SafeAreaView className="flex-1 bg-[#0f161d]" edges={["top", "left", "right"]}>
      <View className="flex-1 flex-row bg-[#0f161d]">
        <AdminSidebar activeSection="knowledge" />

        <View className="min-w-0 flex-1 overflow-hidden">
          <View className="min-h-0 flex-1 px-5 pt-[28px] lg:px-5">
            <View className="mb-[31px]">
              <Pressable
                className="h-9 self-start flex-row items-center justify-center rounded-lg border border-[rgba(148,163,184,0.18)] bg-transparent px-3 hover:border-[rgba(255,122,0,0.35)] hover:bg-[rgba(255,255,255,0.04)]"
                onPress={() => router.replace("/")}
              >
                <ArrowLeft size={17} color="#AAB4C0" strokeWidth={2.5} />
                <Text className="ml-2 text-[13px] font-bold text-[#AAB4C0]">Wróć do dokumentów</Text>
              </Pressable>
              <View className="mt-4 min-w-0">
                <Text numberOfLines={1} className="text-[28px] font-black leading-[38px] text-[#dfe7f2]">
                  Szczegóły dokumentu
                </Text>
              </View>
            </View>

            {loading ? (
              <View className="flex-1 items-center justify-center rounded-lg border border-[#2d3745] bg-[#171e27]">
                <Text className="text-[16px] font-semibold text-[#dfe6ef]">Ładowanie dokumentu...</Text>
              </View>
            ) : null}

            {!loading && error ? (
              <View className="flex-1 items-center justify-center rounded-lg border border-[#8d540f] bg-[#1b222b] px-8">
                <Text className="text-center text-[16px] font-semibold text-[#ff9300]">{error}</Text>
              </View>
            ) : null}

            {!loading && !error && attachment ? (
              <View className="min-h-0 flex-1 flex-row gap-5 pb-5">
                <PreviewCard fileUrl={fileUrl} filename={attachment.original_filename} />
                <View className="min-h-0 w-[420px] shrink-0">
                  <ScrollView className="flex-1" contentContainerClassName="gap-5 pb-1">
                    <StatusCard hasAssignedMachines={(attachment.devices?.length ?? 0) > 0} />
                    <FileInfoCard attachment={attachment} />
                    <RelatedMachinesCard documentId={id ?? ""} devices={attachment.devices ?? []} />
                    <DangerActionsCard onDeletePress={openDeletePrompt} />
                  </ScrollView>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </View>
      <DeleteDocumentConfirmationModal
        documentName={attachment?.original_filename ?? "Dokument"}
        deleteError={deleteError}
        deleting={deleting}
        onCancel={closeDeletePrompt}
        onConfirm={confirmDeleteDocument}
        onPhraseChange={setDeletePhrase}
        phrase={deletePhrase}
        visible={deletePromptVisible}
      />
    </SafeAreaView>
  );
}
