import Constants from "expo-constants";
import { apiUrl } from "../config/api";
import { router } from "expo-router";
import { createElement, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  FileText,
  Search,
  Trash2,
  Upload,
  Wrench,
  X,
  ZoomIn
} from "lucide-react-native";
import { Image, Platform, Pressable, ScrollView, Text, TextInput, View, type ImageStyle, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdminSidebar } from "../components/AdminSidebar";

type Step = 1 | 2 | 3;

const DEVICES_URL = apiUrl("api/devices");
const BRANDS_URL = apiUrl("api/brands");
const DEVICE_TYPES_URL = apiUrl("api/device_types");
const ATTACHMENTS_URL = apiUrl("api/attachments");
const WEB_DEVICES_URL = "/api/devices";
const WEB_BRANDS_URL = "/api/brands";
const WEB_DEVICE_TYPES_URL = "/api/device_types";
const WEB_ATTACHMENTS_URL = "/api/attachments";
const MAX_UPLOAD_SIZE = 200 * 1024 * 1024;
const AUTH_TOKEN =
  ((Constants.expoConfig?.extra as { authToken?: string } | undefined)?.authToken) ??
  process.env.AUTH_TOKEN ??
  process.env.EXPO_PUBLIC_AUTH_TOKEN ??
  "";

const adminMainStyle =
  Platform.OS === "web"
    ? ({
        backgroundColor: "#0B1117",
        minHeight: "100vh",
        overflowX: "hidden",
        scrollbarGutter: "stable"
      } as unknown as ViewStyle)
    : undefined;

const scrollViewStyle =
  Platform.OS === "web"
    ? ({
        overflowX: "hidden",
        scrollbarGutter: "stable"
      } as unknown as ViewStyle)
    : undefined;

const scrollContentStyle =
  Platform.OS === "web"
    ? ({
        alignItems: "center",
        minHeight: "calc(100vh - 88px)",
        scrollbarGutter: "stable"
      } as unknown as ViewStyle)
    : undefined;

const pageShellStyle =
  Platform.OS === "web"
    ? ({
        boxSizing: "border-box",
        marginLeft: "auto",
        marginRight: "auto",
        maxWidth: 1600,
        minWidth: 0,
        paddingBottom: "clamp(24px, 3vw, 48px)",
        paddingLeft: "clamp(24px, 3vw, 48px)",
        paddingRight: "clamp(24px, 3vw, 48px)",
        paddingTop: "clamp(16px, 2.25vw, 36px)",
        flexShrink: 0,
        width: "100%"
      } as unknown as ViewStyle)
    : undefined;

const webUploadZoneStyle = (dragActive: boolean) =>
  ({
    alignItems: "center",
    backgroundColor: dragActive ? "#111b24" : "#071017",
    border: `2px dashed ${dragActive ? "#ff8a00" : "#6d4a28"}`,
    borderRadius: 8,
    boxSizing: "border-box",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    height: "clamp(220px, calc(100vh - 520px), 420px)",
    justifyContent: "center",
    minHeight: 220,
    maxHeight: 420
  }) as unknown as ViewStyle;

const wizardFooterStyle =
  Platform.OS === "web"
    ? ({
        backgroundColor: "#0B1117",
        borderTopColor: "rgba(255,255,255,0.08)",
        borderTopWidth: 1,
        bottom: 0,
        boxSizing: "border-box",
        left: 0,
        position: "absolute",
        right: 0,
        zIndex: 200
      } as unknown as ViewStyle)
    : undefined;

const wizardFooterInnerStyle =
  Platform.OS === "web"
    ? ({
        boxSizing: "border-box",
        display: "flex",
        height: 88,
        justifyContent: "center",
        marginLeft: "auto",
        marginRight: "auto",
        maxWidth: 1600,
        minWidth: 0,
        paddingLeft: "clamp(24px, 3vw, 48px)",
        paddingRight: "clamp(24px, 3vw, 48px)",
        flexShrink: 0,
        width: "100%"
      } as unknown as ViewStyle)
    : undefined;

const wizardFooterSpacerStyle =
  Platform.OS === "web"
    ? ({
        height: 104
      } as unknown as ViewStyle)
    : undefined;

const machineSelectColumnStyle = { width: 52 } as unknown as ViewStyle;
const machineImageColumnStyle = { width: 64 } as unknown as ViewStyle;
const machineModelColumnStyle = { width: 456 } as unknown as ViewStyle;
const machineBrandColumnStyle = { width: 230 } as unknown as ViewStyle;
const machineTypeColumnStyle = { width: 260 } as unknown as ViewStyle;
const machineDocumentsColumnStyle = { width: 160 } as unknown as ViewStyle;

const tableHeaderTextStyle =
  Platform.OS === "web"
    ? ({
        lineHeight: 13
      } as TextStyle)
    : undefined;

const imageModalBackdropStyle =
  Platform.OS === "web"
    ? ({
        alignItems: "center",
        backgroundColor: "rgba(0, 0, 0, 0.72)",
        bottom: 0,
        display: "flex",
        justifyContent: "center",
        left: 0,
        padding: 24,
        position: "fixed",
        right: 0,
        top: 0,
        zIndex: 1000
      } as unknown as ViewStyle)
    : ({
        alignItems: "center",
        backgroundColor: "rgba(0, 0, 0, 0.72)",
        bottom: 0,
        justifyContent: "center",
        left: 0,
        padding: 24,
        position: "absolute",
        right: 0,
        top: 0,
        zIndex: 1000
      } as unknown as ViewStyle);

const imageModalPanelStyle =
  Platform.OS === "web"
    ? ({
        maxHeight: "85vh",
        width: "min(900px, 90vw)"
      } as unknown as ViewStyle)
    : undefined;

const imageModalImageStyle =
  Platform.OS === "web"
    ? ({
        maxHeight: "65vh",
        width: "100%"
      } as unknown as ImageStyle)
    : undefined;
export type Device = {
  id: number;
  name: string;
  model_serial_code?: string;
  image_url?: string;
  brand_id?: number;
  brand_name?: string;
  brand_logo_url?: string;
  device_type_id?: number;
  device_type_name?: string;
};

export type Brand = {
  id: number;
  name: string;
  logo_url?: string;
};

export type DeviceType = {
  id: number;
  name: string;
};

type UploadFile = {
  name: string;
  size?: number;
  type?: string;
  raw: unknown;
};

type AttachmentWithDevices = {
  devices?: Device[];
};

function getApiHeaders() {
  return Platform.OS === "web" ? undefined : { Authorization: `Bearer ${AUTH_TOKEN}` };
}

function formatBytes(size?: number) {
  if (!size) return "Brak rozmiaru";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function getSelectedLabel(count: number) {
  if (count === 1) return "1 maszyna";
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  const suffix = lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14) ? "maszyny" : "maszyn";
  return `${count} ${suffix}`;
}

function getSelectedAssignmentLabel(count: number) {
  return `${count} ${count === 1 ? "wybranej maszyny" : "wybranych maszyn"}`;
}

function getDocumentCountLabel(count: number) {
  if (count === 0) return "Brak";
  if (count === 1) return "1 dokument";
  return `${count} dokumentów`;
}

export async function fetchDevices() {
  const response = await fetch(Platform.OS === "web" ? WEB_DEVICES_URL : DEVICES_URL, {
    headers: getApiHeaders()
  });

  if (!response.ok) {
    let detail: string | undefined;
    try {
      detail = ((await response.json()) as { detail?: string }).detail;
    } catch {}
    throw new Error(detail ?? `Nie udalo sie pobrac maszyn (${response.status}).`);
  }

  return (await response.json()) as Device[];
}

export async function fetchBrands() {
  const response = await fetch(Platform.OS === "web" ? WEB_BRANDS_URL : BRANDS_URL, {
    headers: getApiHeaders()
  });

  if (!response.ok) {
    let detail: string | undefined;
    try {
      detail = ((await response.json()) as { detail?: string }).detail;
    } catch {}
    throw new Error(detail ?? `Nie udalo sie pobrac marek (${response.status}).`);
  }

  return (await response.json()) as Brand[];
}

export async function fetchDeviceTypes() {
  const response = await fetch(Platform.OS === "web" ? WEB_DEVICE_TYPES_URL : DEVICE_TYPES_URL, {
    headers: getApiHeaders()
  });

  if (!response.ok) {
    let detail: string | undefined;
    try {
      detail = ((await response.json()) as { detail?: string }).detail;
    } catch {}
    throw new Error(detail ?? `Nie udalo sie pobrac typow maszyn (${response.status}).`);
  }

  return (await response.json()) as DeviceType[];
}

export async function fetchDeviceDocumentCounts() {
  const response = await fetch(Platform.OS === "web" ? WEB_ATTACHMENTS_URL : ATTACHMENTS_URL, {
    headers: getApiHeaders()
  });

  if (!response.ok) {
    throw new Error(`Nie udalo sie pobrac liczby dokumentow (${response.status}).`);
  }

  let attachments = (await response.json()) as AttachmentWithDevices[];

  if (Platform.OS !== "web") {
    attachments = await Promise.all(
      attachments.map(async (attachment) => {
        const id = (attachment as { id?: number }).id;
        if (!id) return attachment;

        try {
          const devicesResponse = await fetch(`${ATTACHMENTS_URL}/${id}/devices`, {
            headers: getApiHeaders()
          });

          if (!devicesResponse.ok) return attachment;
          return { ...attachment, devices: (await devicesResponse.json()) as Device[] };
        } catch {
          return attachment;
        }
      })
    );
  }

  const counts = new Map<number, number>();
  attachments.forEach((attachment) => {
    attachment.devices?.forEach((device) => {
      counts.set(device.id, (counts.get(device.id) ?? 0) + 1);
    });
  });

  return counts;
}

export function applyDeviceDictionaries(devices: Device[], brands: Brand[], deviceTypes: DeviceType[]) {
  const brandsById = new Map(brands.map((brand) => [brand.id, brand]));
  const deviceTypesById = new Map(deviceTypes.map((deviceType) => [deviceType.id, deviceType.name]));
  return devices.map((device) => ({
    ...device,
    brand_logo_url: device.brand_id ? brandsById.get(device.brand_id)?.logo_url : undefined,
    brand_name: device.brand_id ? brandsById.get(device.brand_id)?.name : undefined,
    device_type_name: device.device_type_id ? deviceTypesById.get(device.device_type_id) : undefined
  }));
}

async function uploadAttachment(file: UploadFile, selectedDeviceIds: number[]) {
  const formData = new FormData();
  formData.append("file", file.raw as Blob);
  selectedDeviceIds.forEach((id) => formData.append("device_ids", String(id)));

  const response = await fetch(Platform.OS === "web" ? WEB_ATTACHMENTS_URL : ATTACHMENTS_URL, {
    method: "POST",
    headers: getApiHeaders(),
    body: formData
  });

  if (!response.ok) {
    let detail: string | undefined;
    try {
      detail = ((await response.json()) as { detail?: string }).detail;
    } catch {}
    throw new Error(detail ?? `Nie udalo sie utworzyc dokumentu (${response.status}).`);
  }

  return response.json();
}

function StepHeader({ step }: { step: Step }) {
  const items = [
    { id: 1, label: "Plik dokumentu" },
    { id: 2, label: "Wybór maszyn" },
    { id: 3, label: "Podsumowanie" }
  ];

  return (
    <View className="flex-row gap-4">
      {items.map((item) => {
        const active = item.id === step;
        const done = item.id < step;

        return (
          <View key={item.id} className="flex-1">
            <View className="flex-row items-center">
              <View
                className={`h-8 w-8 items-center justify-center rounded-full border ${
                  active || done ? "border-[#b86520] bg-[#d9893d]" : "border-[#3c4754] bg-[#1a232e]"
                }`}
              >
                {done ? (
                  <Check size={14} color="#111820" strokeWidth={3} />
                ) : (
                  <Text className={`text-[12px] font-black ${active ? "text-[#111820]" : "text-[#8793a1]"}`}>{item.id}</Text>
                )}
              </View>
              <Text className={`ml-3 flex-1 text-[12px] font-black uppercase tracking-[0.5px] ${active || done ? "text-[#d99a5a]" : "text-[#8793a1]"}`}>
                {item.label}
              </Text>
            </View>
            <View className={`mt-2 h-[2px] rounded-full ${active || done ? "bg-[#c8752e]" : "bg-[#27313d]"}`} />
          </View>
        );
      })}
    </View>
  );
}

function WizardStepHeader({ step, subtitle, title }: { step: Step; title: string; subtitle?: string; onBack?: () => void }) {
  return (
    <>
      <StepHeader step={step} />
      <View className="mt-5 flex-row items-start">
        <View className="flex-1">
          <Text className="text-[32px] font-black text-[#dfe7f2]">{title}</Text>
          {subtitle ? <Text className="mt-2 text-[15px] font-semibold text-[#9AA4B2]">{subtitle}</Text> : null}
        </View>
      </View>
    </>
  );
}

function DetailsStep({
  file,
  onFileChange,
  onFileRemove
}: {
  file?: UploadFile;
  onFileChange: (file: UploadFile) => void;
  onFileRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState<string>();

  function openPicker() {
    if (Platform.OS === "web") {
      inputRef.current?.click();
    }
  }

  function applySelectedFile(selectedFile?: File) {
    if (!selectedFile) return;

    const isPdf = selectedFile.type === "application/pdf" || selectedFile.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setFileError("Wybierz plik PDF.");
      return;
    }

    if (selectedFile.size > MAX_UPLOAD_SIZE) {
      setFileError("Plik jest za duży. Maksymalny rozmiar to 200 MB.");
      return;
    }

    setFileError(undefined);
    onFileChange({
      name: selectedFile.name,
      size: selectedFile.size,
      type: selectedFile.type,
      raw: selectedFile
    });

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function removeFile() {
    setFileError(undefined);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    onFileRemove();
  }

  function handleDragEvent(event: DragEvent, active: boolean) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(active);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    applySelectedFile(event.dataTransfer.files?.[0]);
  }

  const fileInput =
    Platform.OS === "web"
      ? createElement("input", {
          ref: inputRef,
          type: "file",
          accept: "application/pdf",
          style: { display: "none" },
          onChange: (event: { target: { files?: FileList | null } }) => {
            applySelectedFile(event.target.files?.[0]);
          }
        })
      : null;

  const emptyUploadContent = (
    <>
      <View className="h-16 w-16 items-center justify-center rounded-full bg-[#303944]">
        <Upload size={29} color="#ffb36f" />
      </View>
      <Text
        numberOfLines={2}
        className="mt-5 max-w-[680px] text-center text-[20px] font-black leading-[26px] text-[#e5edf8]"
      >
        Przeciągnij plik tutaj lub wybierz go z dysku
      </Text>
      <View className="mt-6 h-11 min-w-[190px] items-center justify-center rounded-md bg-[#303944] px-6">
        <Text className="text-[15px] font-black leading-[19px] text-[#e5edf8]">Wybierz z dysku</Text>
      </View>
    </>
  );

  const uploadZone =
    Platform.OS === "web"
      ? createElement(
          "div",
          {
            onClick: openPicker,
            onDragEnter: (event: DragEvent) => handleDragEvent(event, true),
            onDragOver: (event: DragEvent) => handleDragEvent(event, true),
            onDragLeave: (event: DragEvent) => handleDragEvent(event, false),
            onDrop: handleDrop,
            style: webUploadZoneStyle(dragActive)
          },
          emptyUploadContent
        )
      : (
          <Pressable className="min-h-[240px] items-center justify-center rounded-lg border-2 border-dashed border-[#6d4a28] bg-[#071017]" onPress={openPicker}>
            {emptyUploadContent}
          </Pressable>
        );

  const fileCard = file ? (
    <View className="min-h-[96px] min-w-0 flex-row items-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27] px-5 py-4">
      <View className="h-[64px] w-[52px] items-center justify-center rounded-md border border-[#7a332d] bg-[#3b1719]">
        <FileText size={28} color="#ff5f57" strokeWidth={2.4} />
        <View className="absolute bottom-2 rounded bg-[#111820] px-2 py-0.5">
          <Text className="text-[10px] font-black text-[#e5edf8]">PDF</Text>
        </View>
      </View>
      <View className="ml-5 min-w-0 flex-1">
        <Text numberOfLines={1} className="text-[20px] font-semibold text-[#E8EAED]">{file.name}</Text>
        <View className="mt-2 flex-row items-center">
          <Text className="text-[14px] font-medium text-[#9AA4B2]">PDF</Text>
          <Text className="mx-2 text-[14px] font-medium text-[#566170]">·</Text>
          <Text className="text-[14px] font-medium text-[#9AA4B2]">{formatBytes(file.size)}</Text>
          <Text className="mx-2 text-[14px] font-medium text-[#566170]">·</Text>
          <View className="flex-row items-center">
            <View className="h-2 w-2 rounded-full bg-[#20e288]" />
            <Text className="ml-2 text-[14px] font-medium text-[#E8EAED]">Gotowy do przejścia dalej</Text>
          </View>
        </View>
      </View>
      <View className="ml-5 flex-row gap-3">
        <Pressable className="h-10 justify-center rounded-md border border-[rgba(255,255,255,0.08)] px-4 hover:bg-[#1B2633]" onPress={openPicker}>
          <Text className="text-[13px] font-black text-[#ffd1a4]">Zmień plik</Text>
        </Pressable>
        <Pressable className="h-10 flex-row items-center justify-center rounded-md border border-[#7a332d] px-4" onPress={removeFile}>
          <Trash2 size={15} color="#ffaaa8" />
          <Text className="ml-2 text-[13px] font-black text-[#ffaaa8]">Usuń</Text>
        </Pressable>
      </View>
    </View>
  ) : null;

  return (
    <>
      <WizardStepHeader
        step={1}
        title="Dodaj dokument"
      />

      <View className="relative mt-8" style={{ zIndex: 1, elevation: 1 }}>
        <View>
          {fileInput}
          <View>
            <Text className="mb-3 text-[13px] font-black uppercase tracking-[0.7px] text-[#ffb36f]">Załącznik PDF</Text>
            {fileCard ?? uploadZone}
            {fileError ? (
              <View className="mt-4 rounded-md border border-[#965a12] bg-[#2a1d13] px-4 py-3">
                <Text className="text-[14px] font-black text-[#ffb36f]">{fileError}</Text>
              </View>
            ) : null}
            <View className="mt-5 flex-row gap-3" style={{ display: file ? "none" : "flex" }}>
              {file ? (
                <>
                  <UploadHint label="Format" value="PDF" />
                  <UploadHint label="Rozmiar pliku" value={`${formatBytes(file.size)} / 200 MB`} />
                  <UploadHint label="Status" value="Poprawny" tone="success" />
                </>
              ) : (
                <>
                  <UploadHint label="Akceptowane formaty" value="PDF" />
                  <UploadHint label="Maksymalny rozmiar" value="200 MB" />
                  <UploadHint label="Następny krok" value="Przypisanie do maszyn" />
                </>
              )}
            </View>
          </View>
        </View>
      </View>
      <View style={wizardFooterSpacerStyle} />
    </>
  );
}

function UploadHint({ label, tone, value }: { label: string; tone?: "success"; value: string }) {
  return (
    <View className="min-h-[78px] flex-1 justify-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27] px-5">
      <Text className="text-[12px] font-black uppercase tracking-[0.5px] text-[#9AA4B2]">{label}</Text>
      {tone === "success" ? (
        <View className="mt-2 flex-row items-center">
          <View className="h-2 w-2 rounded-full bg-[#20e288]" />
          <Text className="ml-2 text-[16px] font-black text-[#E8EAED]">{value}</Text>
        </View>
      ) : (
        <Text className="mt-2 text-[16px] font-black text-[#E8EAED]">{value}</Text>
      )}
    </View>
  );
}

export function WizardActionFooter({
  disabled,
  onPrimary,
  onSecondary,
  primaryLabel,
  secondaryLabel,
  trailing
}: {
  disabled?: boolean;
  onPrimary: () => void;
  onSecondary: () => void;
  primaryLabel: string;
  secondaryLabel: string;
  trailing?: ReactNode;
}) {
  return (
    <View className="border-t border-[rgba(255,255,255,0.08)] bg-[#0B1117]" style={wizardFooterStyle}>
      <View style={wizardFooterInnerStyle}>
        <View className="flex-row items-center">
          <Pressable className="h-[48px] w-[118px] items-center justify-center rounded-md border border-[rgba(255,255,255,0.08)] hover:bg-[#1B2633]" onPress={onSecondary}>
            <Text className="text-[14px] font-black text-[#E8EAED]">{secondaryLabel}</Text>
          </Pressable>
          <View className="ml-auto mr-8">{trailing}</View>
          <Pressable
            className={`h-[48px] w-[184px] flex-row items-center justify-center rounded-md ${disabled ? "bg-[#5d4630] opacity-45 cursor-not-allowed" : "bg-[#FF7A00] hover:bg-[#FF921F]"}`}
            disabled={disabled}
            onPress={onPrimary}
          >
            <Text className="text-[14px] font-black text-[#111820]">{primaryLabel}</Text>
            <ArrowRight size={21} color="#111820" className="ml-4" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function MachineChoiceStep({
  brands,
  deviceDocumentCounts,
  devices,
  deviceTypes,
  devicesError,
  devicesLoading,
  onBack,
  onNext,
  search,
  selectedBrandId,
  selectedDeviceIds,
  selectedDeviceTypeId,
  setSelectedBrandId,
  setSelectedDeviceTypeId,
  setSearch,
  showHeader = true,
  toggleDevice,
  toggleVisibleDevices
}: {
  brands: Brand[];
  deviceDocumentCounts: Map<number, number>;
  devices: Device[];
  deviceTypes: DeviceType[];
  devicesError?: string;
  devicesLoading: boolean;
  onBack: () => void;
  onNext: () => void;
  search: string;
  selectedBrandId?: number;
  selectedDeviceIds: number[];
  selectedDeviceTypeId?: number;
  setSelectedBrandId: (id?: number) => void;
  setSelectedDeviceTypeId: (id?: number) => void;
  setSearch: (value: string) => void;
  showHeader?: boolean;
  toggleDevice: (id: number) => void;
  toggleVisibleDevices: (ids: number[]) => void;
}) {
  const selectedCount = selectedDeviceIds.length;
  const [previewDeviceId, setPreviewDeviceId] = useState<number>();
  const filteredDevices = useMemo(() => {
    const query = search.trim().toLowerCase();
    return devices.filter((device) => {
      if (selectedBrandId && device.brand_id !== selectedBrandId) return false;
      if (selectedDeviceTypeId && device.device_type_id !== selectedDeviceTypeId) return false;
      if (!query) return true;

      return [device.name, device.brand_name, device.device_type_name, device.model_serial_code, String(device.brand_id ?? ""), String(device.device_type_id ?? "")]
        .filter(Boolean)
        .some((value) => (value ?? "").toLowerCase().includes(query));
    });
  }, [devices, search, selectedBrandId, selectedDeviceTypeId]);
  const filteredDeviceIds = useMemo(() => filteredDevices.map((device) => device.id), [filteredDevices]);
  const previewDevice = filteredDevices.find((device) => device.id === previewDeviceId && device.image_url);
  const allVisibleSelected = filteredDeviceIds.length > 0 && filteredDeviceIds.every((id) => selectedDeviceIds.includes(id));
  const someVisibleSelected = filteredDeviceIds.some((id) => selectedDeviceIds.includes(id));

  return (
    <>
      {showHeader ? (
        <WizardStepHeader
        step={2}
        title="Wybór maszyn"
        subtitle="Wybierz modele, do ktorych ma zostac przypisany dokument."
        onBack={onBack}
        />
      ) : null}

      <View className={showHeader ? "relative mt-8" : "relative"} style={{ zIndex: 50, elevation: 50 }}>
        <View className="relative flex-row items-center gap-3 border-b border-[rgba(255,255,255,0.08)] pb-4" style={{ zIndex: 60, elevation: 60 }}>
          <View className="h-[42px] min-w-[320px] flex-1 flex-row items-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27] px-3">
            <Search size={17} color="#FF7A00" strokeWidth={2.4} />
            <TextInput
              className="ml-3 h-10 flex-1 text-[15px] font-medium text-[#E8EAED] outline-none"
              placeholder="Szukaj po modelu, marce, numerze..."
              placeholderTextColor="#6F7A88"
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <FilterBox allLabel="Marka: wszystkie" options={brands} selectedId={selectedBrandId} width="w-[180px]" onSelect={setSelectedBrandId} />
          <FilterBox allLabel="Typ: wszystkie" options={deviceTypes} selectedId={selectedDeviceTypeId} width="w-[190px]" onSelect={setSelectedDeviceTypeId} />
        </View>
      </View>

      <View className="relative" style={{ zIndex: 1, elevation: 1 }}>
        <View className="h-[62px] flex-row items-center border-b border-[rgba(255,255,255,0.08)] px-4">
          <View className="px-1" style={machineSelectColumnStyle}>
            <Pressable
              className={`h-[18px] w-[18px] items-center justify-center rounded border ${
                allVisibleSelected
                  ? "border-[#FF7A00] bg-[#FF7A00]"
                  : someVisibleSelected
                    ? "border-[#FF7A00] bg-[rgba(255,122,0,0.12)]"
                    : "border-[rgba(255,255,255,0.22)]"
              }`}
              onPress={() => toggleVisibleDevices(filteredDeviceIds)}
            >
              {allVisibleSelected ? <Check size={13} color="#fff" strokeWidth={4} /> : null}
              {!allVisibleSelected && someVisibleSelected ? <View className="h-[2px] w-2 rounded bg-[#FF921F]" /> : null}
            </Pressable>
          </View>
          <View style={machineImageColumnStyle} />
          <Text className="px-3 text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={[machineModelColumnStyle, tableHeaderTextStyle]}>Model</Text>
          <Text className="px-6 text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={[machineBrandColumnStyle, tableHeaderTextStyle]}>Marka</Text>
          <Text className="px-3 text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={[machineTypeColumnStyle, tableHeaderTextStyle]}>Typ</Text>
          <Text className="px-3 text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={[machineDocumentsColumnStyle, tableHeaderTextStyle]}>Dokumenty</Text>
        </View>

        <View className="pt-2">
          {devicesLoading ? <EmptyRow label="Ladowanie maszyn..." /> : null}
          {!devicesLoading && devicesError ? <EmptyRow label={devicesError} tone="error" /> : null}
          {!devicesLoading && !devicesError && filteredDevices.length === 0 ? <EmptyRow label="Brak maszyn do wyswietlenia." /> : null}
          {!devicesLoading && !devicesError
            ? filteredDevices.map((device) => (
                <MachineRow
                  key={device.id}
                  device={device}
                  documentCount={deviceDocumentCounts.get(device.id) ?? 0}
                  selected={selectedDeviceIds.includes(device.id)}
                  onToggle={() => toggleDevice(device.id)}
                  onPreview={() => setPreviewDeviceId(device.id)}
                />
              ))
            : null}
        </View>
      </View>

      {previewDevice ? (
        <MachineImageModal
          device={previewDevice}
          onClose={() => setPreviewDeviceId(undefined)}
        />
      ) : null}

      <View style={wizardFooterSpacerStyle} />
    </>
  );
}

function EmptyRow({ label, tone }: { label: string; tone?: "error" }) {
  return (
    <View className={`h-[86px] justify-center border-b px-[25px] ${tone === "error" ? "border-b-[#FF7A00]" : "border-b-[rgba(255,255,255,0.08)]"}`}>
      <Text className={`text-[15px] font-semibold ${tone === "error" ? "text-[#FF921F]" : "text-[#E8EAED]"}`}>{label}</Text>
    </View>
  );
}

function FilterBox({
  allLabel,
  onSelect,
  options,
  selectedId,
  width
}: {
  allLabel: string;
  onSelect: (id?: number) => void;
  options: Array<{ id: number; name: string }>;
  selectedId?: number;
  width: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => option.id === selectedId);
  const dropdownOptions = [{ id: undefined, name: allLabel }, ...options] as Array<{ id?: number; name: string }>;

  function selectOption(id?: number) {
    onSelect(id);
    setOpen(false);
  }

  return (
    <View className={`relative ${width}`} style={{ zIndex: open ? 1000 : 10, elevation: open ? 1000 : 10 }}>
      <Pressable
        className={`h-[42px] flex-row items-center justify-between rounded-md border bg-[#151D27] px-3 ${open ? "border-[#FF7A00]" : "border-[rgba(255,255,255,0.08)]"}`}
        onPress={() => setOpen((current) => !current)}
      >
        <Text numberOfLines={1} className="min-w-0 flex-1 text-[15px] font-medium text-[#E8EAED]">{selectedOption?.name ?? allLabel}</Text>
        <ChevronDown size={18} color={open ? "#FF921F" : "#6F7A88"} strokeWidth={2.4} />
      </Pressable>

      {open ? (
        <View
          className="absolute left-0 right-0 top-[48px] overflow-hidden rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27]"
          style={{ zIndex: 1100, elevation: 1100, boxShadow: "0 16px 28px rgba(0, 0, 0, 0.36)" }}
        >
          <ScrollView className="max-h-[220px]" showsVerticalScrollIndicator={false}>
            {dropdownOptions.map((option) => {
              const active = option.id === selectedId || (!option.id && !selectedId);

              return (
                <Pressable
                  key={option.id ?? "all"}
                  className={`min-h-[42px] justify-center border-b border-[rgba(255,255,255,0.08)] px-4 ${active ? "bg-[rgba(255,122,0,0.12)]" : "bg-[#151D27]"}`}
                  onPress={() => selectOption(option.id)}
                >
                  <Text numberOfLines={1} className={`text-[13px] font-black ${active ? "text-[#FF921F]" : "text-[#E8EAED]"}`}>
                    {option.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function MachineRow({
  device,
  documentCount,
  onPreview,
  onToggle,
  selected
}: {
  device: Device;
  documentCount: number;
  onPreview: () => void;
  onToggle: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      className={`group relative h-[88px] flex-row items-center border border-transparent border-b-[rgba(255,255,255,0.08)] px-4 ${
        selected
          ? "rounded-md bg-[rgba(255,122,0,0.06)]"
          : "bg-transparent hover:rounded-md hover:border-[rgba(255,255,255,0.08)] hover:bg-[#1B2633]"
      }`}
      onPress={onToggle}
    >
      <View className="items-start px-1" style={machineSelectColumnStyle}>
        <View className={`h-[18px] w-[18px] items-center justify-center rounded border ${selected ? "border-[#FF7A00] bg-[#FF7A00]" : "border-[rgba(255,255,255,0.22)] bg-transparent"}`}>
          {selected ? <Check size={13} color="#fff" strokeWidth={4} /> : null}
        </View>
      </View>
      <View className="items-start" style={machineImageColumnStyle}>
        <Pressable
          className={`group/image h-[48px] w-[48px] items-center justify-center overflow-hidden rounded-md border bg-[#151D27] ${
            device.image_url ? "cursor-pointer border-transparent hover:border-[#FF7A00]" : "border-[rgba(255,255,255,0.08)]"
          }`}
          disabled={!device.image_url}
          onPress={(event) => {
            event.stopPropagation();
            onPreview();
          }}
        >
          {device.image_url ? (
            <>
              <Image source={{ uri: device.image_url }} className="h-full w-full group-hover/image:opacity-75" resizeMode="cover" />
              <View className="absolute inset-0 items-center justify-center bg-[rgba(0,0,0,0.42)] opacity-0 group-hover/image:opacity-100">
                <ZoomIn size={15} color="#fff" strokeWidth={2.6} />
                <Text className="mt-0.5 text-[9px] font-black text-white">Powiększ</Text>
              </View>
            </>
          ) : (
            <Wrench size={22} color="#FF921F" strokeWidth={2.3} />
          )}
        </Pressable>
      </View>
      <View className="min-w-0 px-3" style={machineModelColumnStyle}>
        <Text numberOfLines={1} className="text-[16px] font-semibold text-[#E8EAED]">
          {device.name}
        </Text>
        <Text numberOfLines={1} className="mt-[4px] text-[13px] font-medium text-[#9AA4B2]">
          {device.model_serial_code ?? "Brak kodu"}
        </Text>
      </View>
      <View className="px-3" style={machineBrandColumnStyle}>
        <View className="h-[46px] max-w-[140px] items-start justify-center px-3 py-2">
          {device.brand_logo_url ? (
            <BrandLogo uri={device.brand_logo_url} />
          ) : (
            <Text numberOfLines={1} className="text-[11px] font-black uppercase text-[#FF921F]">
              {device.brand_name ?? "Brak marki"}
            </Text>
          )}
        </View>
      </View>
      <Text numberOfLines={1} className="px-3 text-[15px] font-medium text-[#E8EAED]" style={machineTypeColumnStyle}>
        {device.device_type_name ?? "Brak typu"}
      </Text>
      <View className="items-start px-3" style={machineDocumentsColumnStyle}>
        <Text numberOfLines={1} className="text-[15px] font-medium text-[#E8EAED]">{getDocumentCountLabel(documentCount)}</Text>
      </View>
    </Pressable>
  );
}

function MachineImageModal({
  device,
  onClose
}: {
  device: Device;
  onClose: () => void;
}) {
  if (!device.image_url) return null;

  return (
    <Pressable style={imageModalBackdropStyle} onPress={onClose}>
      <Pressable
        className="cursor-default rounded-xl border border-[rgba(255,122,0,0.25)] bg-[#111820] p-5"
        style={imageModalPanelStyle}
        onPress={(event) => event.stopPropagation()}
      >
        <View className="mb-4 flex-row items-start">
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-[22px] font-black text-[#E8EAED]">{device.name}</Text>
            <Text numberOfLines={1} className="mt-1 text-[14px] font-medium text-[#9AA4B2]">
              {device.model_serial_code ?? "Brak kodu"} · {device.brand_name ?? "Brak marki"} · {device.device_type_name ?? "Brak typu"}
            </Text>
          </View>
          <Pressable className="ml-4 h-9 w-9 items-center justify-center rounded-md hover:bg-[#1B2633]" onPress={onClose}>
            <X size={20} color="#E8EAED" strokeWidth={2.4} />
          </Pressable>
        </View>

        <View className="items-center justify-center overflow-hidden rounded-lg bg-[#0B1117]">
          <Image source={{ uri: device.image_url }} className="h-[520px] w-full" resizeMode="contain" style={imageModalImageStyle} />
        </View>
      </Pressable>
    </Pressable>
  );
}

function BrandLogo({ uri }: { uri: string }) {
  if (Platform.OS === "web") {
    return createElement("img", {
      alt: "",
      src: uri,
      style: {
        display: "block",
        height: 20,
        maxWidth: 112,
        objectFit: "contain",
        objectPosition: "left center",
        width: "auto"
      }
    });
  }

  return <Image source={{ uri }} className="h-[20px] w-[112px]" resizeMode="contain" />;
}

function SummaryStep({
  file,
  selectedDevices,
  submitError
}: {
  file?: UploadFile;
  selectedDevices: Device[];
  submitError?: string;
}) {
  return (
    <>
      <WizardStepHeader
        step={3}
        title="Podsumowanie"
        subtitle="Sprawdź dokument i wybrane maszyny przed dodaniem."
      />

      <View className="mt-5 flex-row items-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27] px-4 py-3">
        <View className="mr-3 h-5 w-5 items-center justify-center rounded-full bg-[rgba(32,226,136,0.12)]">
          <Check size={13} color="#20e288" strokeWidth={3} />
        </View>
        <Text className="text-[14px] font-semibold text-[#9AA4B2]">
          Dokument zostanie przypisany do <Text className="font-black text-[#FF921F]">{getSelectedAssignmentLabel(selectedDevices.length)}</Text>.
        </Text>
      </View>

      <View className="mt-6">
        <View>
          <Text className="mb-3 text-[24px] font-extrabold text-[#E8EAED]">Dane dokumentu</Text>
          <View className="min-h-[82px] flex-row items-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27] px-5 py-3">
            <View className="h-[56px] w-[46px] items-center justify-center rounded-md border border-[#7a332d] bg-[#3b1719]">
              <FileText size={25} color="#ff5f57" strokeWidth={2.4} />
              <View className="absolute bottom-2 rounded bg-[#111820] px-2 py-0.5">
                <Text className="text-[10px] font-black text-[#e5edf8]">PDF</Text>
              </View>
            </View>
            <View className="ml-5 min-w-0 flex-1">
              <Text numberOfLines={1} className="text-[20px] font-semibold text-[#E8EAED]">{file?.name ?? "Brak pliku"}</Text>
              <View className="mt-2 flex-row items-center">
                <Text className="text-[14px] font-medium text-[#9AA4B2]">PDF</Text>
                <Text className="mx-2 text-[14px] font-medium text-[#566170]">·</Text>
                <Text className="text-[14px] font-medium text-[#9AA4B2]">{formatBytes(file?.size)}</Text>
                <Text className="mx-2 text-[14px] font-medium text-[#566170]">·</Text>
                <View className="flex-row items-center">
                  <View className="h-2 w-2 rounded-full bg-[#20e288]" />
                  <Text className="ml-2 text-[14px] font-medium text-[#E8EAED]">Gotowy do dodania</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View className="mt-5">
          <View className="mb-3">
            <Text className="text-[24px] font-extrabold text-[#E8EAED]">Wybrane maszyny</Text>
          </View>

          <View className="overflow-hidden rounded-md border-b border-[rgba(255,255,255,0.08)]">
            <View className="h-[42px] flex-row items-center border-b border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)]">
              <Text className="flex-[1.55] px-6 text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={tableHeaderTextStyle}>Model</Text>
              <Text className="flex-[1] px-3 text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={tableHeaderTextStyle}>Marka</Text>
              <Text className="flex-[1] px-3 text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={tableHeaderTextStyle}>Typ</Text>
            </View>
            {selectedDevices.length === 0 ? <EmptyRow label="Brak przypisanych maszyn" /> : null}
            {selectedDevices.map((device) => (
              <View key={device.id} className="h-[64px] flex-row items-center border border-transparent border-b-[rgba(255,255,255,0.08)] px-3">
                <View className="min-w-0 flex-[1.55] px-3">
                  <Text numberOfLines={1} className="text-[16px] font-semibold text-[#E8EAED]">{device.name}</Text>
                  <Text numberOfLines={1} className="mt-[4px] text-[13px] font-medium text-[#9AA4B2]">
                    {device.model_serial_code ?? "Brak kodu"}
                  </Text>
                </View>
                <View className="flex-[1] px-3">
                  {device.brand_logo_url ? (
                    <BrandLogo uri={device.brand_logo_url} />
                  ) : (
                    <Text numberOfLines={1} className="text-[15px] font-medium text-[#E8EAED]">{device.brand_name ?? "Brak marki"}</Text>
                  )}
                </View>
                <Text numberOfLines={1} className="flex-[1] px-3 text-[15px] font-medium text-[#E8EAED]">
                  {device.device_type_name ?? "Brak typu"}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {submitError ? (
        <View className="mt-4 rounded-md border border-[#965a12] bg-[#1a212b] px-5 py-4">
          <Text className="text-[14px] font-black text-[#ff9300]">{submitError}</Text>
        </View>
      ) : null}

      <View style={wizardFooterSpacerStyle} />
    </>
  );
}

export function AddDocumentScreen() {
  const [step, setStep] = useState<Step>(1);
  const [devices, setDevices] = useState<Device[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [deviceDocumentCounts, setDeviceDocumentCounts] = useState<Map<number, number>>(new Map());
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [devicesError, setDevicesError] = useState<string>();
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [file, setFile] = useState<UploadFile>();
  const [search, setSearch] = useState("");
  const [selectedBrandId, setSelectedBrandId] = useState<number>();
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<number[]>([]);
  const [selectedDeviceTypeId, setSelectedDeviceTypeId] = useState<number>();
  const [submitError, setSubmitError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  useEffect(() => {
    let active = true;

    Promise.all([
      fetchDevices(),
      fetchBrands(),
      fetchDeviceTypes(),
      fetchDeviceDocumentCounts().catch(() => new Map<number, number>())
    ])
      .then(([deviceItems, brandItems, deviceTypeItems, documentCounts]) => {
        if (!active) return;
        setBrands(brandItems);
        setDeviceTypes(deviceTypeItems);
        setDeviceDocumentCounts(documentCounts);
        setDevices(applyDeviceDictionaries(deviceItems, brandItems, deviceTypeItems));
        setDevicesError(undefined);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setDevicesError(error instanceof Error ? error.message : "Nie udalo sie pobrac maszyn.");
      })
      .finally(() => {
        if (active) setDevicesLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const selectedDevices = useMemo(
    () => devices.filter((device) => selectedDeviceIds.includes(device.id)),
    [devices, selectedDeviceIds]
  );

  function toggleDevice(id: number) {
    setSelectedDeviceIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleVisibleDevices(ids: number[]) {
    if (ids.length === 0) return;

    setSelectedDeviceIds((current) => {
      const visibleIds = new Set(ids);
      const allVisibleSelected = ids.every((id) => current.includes(id));

      if (allVisibleSelected) {
        return current.filter((id) => !visibleIds.has(id));
      }

      return Array.from(new Set([...current, ...ids]));
    });
  }

  async function submitDocument() {
    if (!file) {
      setSubmitError("Wybierz plik PDF przed dodaniem dokumentu.");
      return;
    }

    setSubmitting(true);
    setSubmitError(undefined);

    try {
      await uploadAttachment(file, selectedDeviceIds);
      router.replace("/");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Nie udalo sie dodac dokumentu.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-[#0B1117]" edges={["top", "left", "right"]}>
      <View className="flex-1 flex-row bg-[#0B1117]">
        <AdminSidebar activeSection="knowledge" />

        <View className="relative min-w-0 flex-1" style={adminMainStyle}>
          <ScrollView
            ref={scrollRef}
            className="flex-1"
            contentContainerClassName={Platform.OS === "web" ? undefined : "px-[46px] pb-12 pt-8"}
            contentContainerStyle={scrollContentStyle}
            style={scrollViewStyle}
          >
            <View className={Platform.OS === "web" ? undefined : "w-full"} style={pageShellStyle}>
              {step === 1 ? <DetailsStep file={file} onFileChange={setFile} onFileRemove={() => setFile(undefined)} /> : null}
              {step === 2 ? (
                <MachineChoiceStep
                  brands={brands}
                  deviceDocumentCounts={deviceDocumentCounts}
                  devices={devices}
                  deviceTypes={deviceTypes}
                  devicesError={devicesError}
                  devicesLoading={devicesLoading}
                  onBack={() => setStep(1)}
                  onNext={() => setStep(3)}
                  search={search}
                  selectedBrandId={selectedBrandId}
                  selectedDeviceIds={selectedDeviceIds}
                  selectedDeviceTypeId={selectedDeviceTypeId}
                  setSelectedBrandId={setSelectedBrandId}
                  setSelectedDeviceTypeId={setSelectedDeviceTypeId}
                  setSearch={setSearch}
                  toggleDevice={toggleDevice}
                  toggleVisibleDevices={toggleVisibleDevices}
                />
              ) : null}
              {step === 3 ? (
                <SummaryStep
                  file={file}
                  selectedDevices={selectedDevices}
                  submitError={submitError}
                />
              ) : null}
            </View>
          </ScrollView>
          {step === 1 ? (
            <WizardActionFooter
              disabled={!file}
              onPrimary={() => setStep(2)}
              onSecondary={() => router.replace("/")}
              primaryLabel="Dalej"
              secondaryLabel="Anuluj"
            />
          ) : null}
          {step === 2 ? (
            <WizardActionFooter
              onPrimary={() => setStep(3)}
              onSecondary={() => setStep(1)}
              primaryLabel="Dalej"
              secondaryLabel="Wstecz"
              trailing={(
                <Text className="text-[16px] font-medium text-[#9AA4B2]">
                  Wybrano: <Text className="font-black text-[#FF921F]">{getSelectedLabel(selectedDeviceIds.length)}</Text>
                </Text>
              )}
            />
          ) : null}
          {step === 3 ? (
            <WizardActionFooter
              disabled={submitting}
              onPrimary={submitDocument}
              onSecondary={() => setStep(2)}
              primaryLabel={submitting ? "Dodawanie..." : "Dodaj dokument"}
              secondaryLabel="Wstecz"
            />
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}
