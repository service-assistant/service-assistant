import Constants from "expo-constants";
import { router } from "expo-router";
import { apiUrl } from "../config/api";
import { createElement, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  FileCog,
  LucideIcon,
  Plus,
  Search,
  ScrollText,
  ShieldAlert,
  Trash2,
  Upload,
  Workflow
} from "lucide-react-native";
import { Image, Platform, Pressable, ScrollView, Text, TextInput, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdminSidebar } from "../components/AdminSidebar";
import { fetchBrands, fetchDeviceTypes, type Brand, type DeviceType } from "./AddDocumentScreen";

type Step = 1 | 2 | 3;
type DocumentCategory = "Instrukcja" | "Kody błędów" | "Schemat" | "Biuletyn";
type DocumentCategoryFilter = DocumentCategory | "all";

const ATTACHMENTS_URL = apiUrl("api/attachments");
const DEVICES_URL = apiUrl("api/devices");
const WEB_ATTACHMENTS_URL = "/api/attachments";
const WEB_DEVICES_URL = "/api/devices";
const AUTH_TOKEN =
  ((Constants.expoConfig?.extra as { authToken?: string } | undefined)?.authToken) ??
  process.env.AUTH_TOKEN ??
  process.env.EXPO_PUBLIC_AUTH_TOKEN ??
  "";

type AttachmentDevice = {
  id: number;
  name: string;
};

type Attachment = {
  id: number;
  original_filename: string;
  created_at?: string;
  devices?: AttachmentDevice[];
};

type CreatedDevice = {
  id: number;
};

type CreateDevicePayload = {
  brand_id: number;
  device_type_id: number;
  image_url?: string;
  model_serial_code?: string;
  name: string;
};

const documentCategoryStyles: Record<DocumentCategory, { color: string; icon: LucideIcon }> = {
  Instrukcja: {
    color: "#8ed7ff",
    icon: ScrollText
  },
  "Kody błędów": {
    color: "#A78BFA",
    icon: ShieldAlert
  },
  Schemat: {
    color: "#a7f3d0",
    icon: Workflow
  },
  Biuletyn: {
    color: "#d7c7ff",
    icon: FileCog
  }
};

const documentCategoryOptions: Array<{ id: DocumentCategoryFilter; name: string }> = [
  { id: "all", name: "Typ: wszystkie" },
  { id: "Instrukcja", name: "Instrukcja" },
  { id: "Kody błędów", name: "Kody błędów" },
  { id: "Schemat", name: "Schemat" },
  { id: "Biuletyn", name: "Biuletyn" }
];

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
        flexShrink: 0,
        marginLeft: "auto",
        marginRight: "auto",
        maxWidth: 1600,
        minWidth: 0,
        paddingBottom: "clamp(24px, 3vw, 48px)",
        paddingLeft: "clamp(24px, 3vw, 48px)",
        paddingRight: "clamp(24px, 3vw, 48px)",
        paddingTop: "clamp(16px, 2.25vw, 36px)",
        width: "100%"
      } as unknown as ViewStyle)
    : undefined;

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

const noTextSelectionStyle =
  Platform.OS === "web"
    ? ({
        userSelect: "none"
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
    flex: 1,
    justifyContent: "center",
    minHeight: 244
  }) as unknown as ViewStyle;

const documentSelectColumnStyle = { width: 52 } as unknown as ViewStyle;
const documentIconColumnStyle = { width: 64 } as unknown as ViewStyle;
const documentNameColumnStyle = { flexBasis: 0, flexGrow: 4.2, flexShrink: 1, minWidth: 0 } as unknown as ViewStyle;
const documentTypeColumnStyle = { flexBasis: 0, flexGrow: 1.35, flexShrink: 1, minWidth: 120 } as unknown as ViewStyle;
const documentMachinesColumnStyle = { flexBasis: 0, flexGrow: 1.45, flexShrink: 1, minWidth: 130 } as unknown as ViewStyle;
const documentDateColumnStyle = { flexBasis: 0, flexGrow: 1.5, flexShrink: 1, minWidth: 140 } as unknown as ViewStyle;
const basicStepFieldsStyle =
  Platform.OS === "web"
    ? ({
        gap: 24,
        width: "100%"
      } as unknown as ViewStyle)
    : undefined;
const basicStepLayoutStyle =
  Platform.OS === "web"
    ? ({
        alignItems: "stretch",
        columnGap: 36,
        justifyContent: "center"
      } as unknown as ViewStyle)
    : undefined;
const basicStepColumnStyle =
  Platform.OS === "web"
    ? ({
        flexBasis: 0,
        flexGrow: 1,
        flexShrink: 1,
        maxWidth: 520,
        minHeight: 376,
        minWidth: 0,
        width: "100%"
      } as unknown as ViewStyle)
    : undefined;
const basicStepPhotoUploadStyle =
  Platform.OS === "web"
    ? ({
        display: "flex",
        flex: 1,
        flexDirection: "column",
        minHeight: 272
      } as unknown as ViewStyle)
    : undefined;

function getApiHeaders() {
  return Platform.OS === "web" ? undefined : { Authorization: `Bearer ${AUTH_TOKEN}` };
}

async function fetchAttachments() {
  const response = await fetch(Platform.OS === "web" ? WEB_ATTACHMENTS_URL : ATTACHMENTS_URL, {
    headers: getApiHeaders()
  });

  if (!response.ok) {
    let detail: string | undefined;
    try {
      detail = ((await response.json()) as { detail?: string }).detail;
    } catch {}
    throw new Error(detail ?? `Nie udało się pobrać dokumentów (${response.status}).`);
  }

  return (await response.json()) as Attachment[];
}

async function createDevice(payload: CreateDevicePayload) {
  const response = await fetch(Platform.OS === "web" ? WEB_DEVICES_URL : DEVICES_URL, {
    method: "POST",
    headers: {
      ...getApiHeaders(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let detail: string | undefined;
    try {
      detail = ((await response.json()) as { detail?: string }).detail;
    } catch {}
    throw new Error(detail ?? `Nie udało się dodać maszyny (${response.status}).`);
  }

  return (await response.json()) as CreatedDevice;
}

async function assignAttachmentToDevice(attachmentId: number, deviceId: number) {
  const response = await fetch(
    `${Platform.OS === "web" ? WEB_ATTACHMENTS_URL : ATTACHMENTS_URL}/${encodeURIComponent(String(attachmentId))}/devices/${encodeURIComponent(String(deviceId))}`,
    {
      method: "POST",
      headers: {
        ...getApiHeaders(),
        "Content-Type": "application/json"
      },
      body: "{}"
    }
  );

  if (!response.ok) {
    let detail: string | undefined;
    try {
      detail = ((await response.json()) as { detail?: string }).detail;
    } catch {}
    throw new Error(detail ?? `Nie udało się przypisać dokumentu ${attachmentId} do maszyny (${response.status}).`);
  }
}

function getSelectedDocumentsLabel(count: number) {
  if (count === 1) return "1 dokument";
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  const suffix = lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14) ? "dokumenty" : "dokumentów";
  return `${count} ${suffix}`;
}

function getAssignedMachinesLabel(count: number) {
  if (count === 1) return "1 maszyna";
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  const suffix = lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14) ? "maszyny" : "maszyn";
  return `${count} ${suffix}`;
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

function formatDate(value?: string) {
  if (!value) return "Brak daty";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function StepHeader({ step }: { step: Step }) {
  const items = [
    { id: 1, label: "Dane maszyny" },
    { id: 2, label: "Dokumentacja" },
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

function WizardStepHeader({ step, subtitle, title }: { step: Step; title: string; subtitle?: string }) {
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

function FormLabel({ children }: { children: ReactNode }) {
  return <Text className="mb-3 text-[13px] font-black uppercase tracking-[0.7px] text-[#ffb36f]">{children}</Text>;
}

function InputField({
  label,
  onChangeText,
  onFocus,
  placeholder,
  value
}: {
  label: string;
  onChangeText: (value: string) => void;
  onFocus?: () => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View>
      <FormLabel>{label}</FormLabel>
      <TextInput
        className="h-[48px] rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27] px-4 text-[16px] font-medium text-[#E8EAED] outline-none"
        onChangeText={onChangeText}
        onFocus={onFocus}
        placeholder={placeholder}
        placeholderTextColor="#728096"
        value={value}
      />
    </View>
  );
}

function MachinePhotoDropZone({ diskImageUrl, onDiskImageChange }: { diskImageUrl: string; onDiskImageChange: (value: string) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  function useFile(file?: File) {
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onDiskImageChange(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  function openPicker() {
    if (Platform.OS === "web") {
      fileInputRef.current?.click();
    }
  }

  function clearPhoto() {
    onDiskImageChange("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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
    useFile(event.dataTransfer.files?.[0]);
  }

  const emptyUploadContent = (
    <>
      <View className="h-16 w-16 items-center justify-center rounded-full bg-[#303944]">
        <Upload size={29} color="#ffb36f" />
      </View>
      <Text numberOfLines={2} className="mt-5 max-w-[340px] text-center text-[20px] font-black leading-[26px] text-[#e5edf8]">
        Przeciągnij zdjęcie tutaj lub wybierz je z dysku
      </Text>
      <View className="mt-6 h-11 min-w-[190px] items-center justify-center rounded-md bg-[#303944] px-6">
        <Text className="text-[15px] font-black leading-[19px] text-[#e5edf8]">Wybierz z dysku</Text>
      </View>
    </>
  );

  const photoCard = diskImageUrl ? (
    <View className="min-h-[244px] min-w-0 flex-1 flex-row items-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27] px-5 py-4">
      <View className="h-[80px] w-[104px] overflow-hidden rounded-md border border-[rgba(255,255,255,0.08)] bg-[#071017]">
        <Image source={{ uri: diskImageUrl }} className="h-full w-full" resizeMode="cover" />
      </View>
      <View className="ml-5 min-w-0 flex-1">
        <Text numberOfLines={1} className="text-[20px] font-semibold text-[#E8EAED]">Zdjęcie z dysku</Text>
        <View className="mt-2 flex-row items-center">
          <Text className="text-[14px] font-medium text-[#9AA4B2]">Obraz</Text>
          <Text className="mx-2 text-[14px] font-medium text-[#566170]">·</Text>
          <View className="flex-row items-center">
            <View className="h-2 w-2 rounded-full bg-[#20e288]" />
            <Text className="ml-2 text-[14px] font-medium text-[#E8EAED]">Gotowe</Text>
          </View>
        </View>
      </View>
      <View className="ml-5 gap-3">
        <Pressable className="h-10 justify-center rounded-md border border-[rgba(255,255,255,0.08)] px-4 hover:bg-[#1B2633]" onPress={openPicker}>
          <Text className="text-[13px] font-black text-[#ffd1a4]">Zmień zdjęcie</Text>
        </Pressable>
        <Pressable className="h-10 flex-row items-center justify-center rounded-md border border-[#7a332d] px-4" onPress={clearPhoto}>
          <Trash2 size={15} color="#ffaaa8" />
          <Text className="ml-2 text-[13px] font-black text-[#ffaaa8]">Usuń</Text>
        </Pressable>
      </View>
    </View>
  ) : null;

  if (Platform.OS === "web") {
    return (
      <View style={basicStepPhotoUploadStyle}>
        <FormLabel>Zdjęcie z dysku</FormLabel>
        {createElement("input", {
          accept: "image/*",
          ref: fileInputRef,
          style: { display: "none" },
          type: "file",
          onChange: (event: Event) => {
            const input = event.currentTarget as HTMLInputElement;
            useFile(input.files?.[0]);
            input.value = "";
          }
        })}
        {photoCard ?? createElement(
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
        )}
      </View>
    );
  }

  return (
      <View style={basicStepPhotoUploadStyle}>
        <FormLabel>Zdjęcie z dysku</FormLabel>
      {photoCard ?? (
        <Pressable className="flex-1 min-h-[244px] items-center justify-center rounded-lg border-2 border-dashed border-[#6d4a28] bg-[#071017]" onPress={openPicker}>
          {emptyUploadContent}
        </Pressable>
      )}
    </View>
  );
}

function SelectField({
  error,
  label,
  loading,
  onSelect,
  onOpenChange,
  open,
  options,
  placeholder,
  stackOrder = 100,
  selectedId
}: {
  error?: string;
  label?: string;
  loading?: boolean;
  onSelect?: (id?: number) => void;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  options?: Array<{ id: number; name: string }>;
  placeholder: string;
  stackOrder?: number;
  selectedId?: number;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const selectedOption = options?.find((option) => option.id === selectedId);
  const disabled = loading || !!error || !options || options.length === 0;

  function setOpenState(nextOpen: boolean) {
    if (onOpenChange) {
      onOpenChange(nextOpen);
      return;
    }

    setInternalOpen(nextOpen);
  }

  function selectOption(id?: number) {
    onSelect?.(id);
    setOpenState(false);
  }

  return (
    <View nativeID="machine-select-root" className="relative" style={{ zIndex: isOpen ? stackOrder : 100, elevation: isOpen ? stackOrder : 100 }}>
      {label ? <FormLabel>{label}</FormLabel> : null}
      <Pressable
        className={`h-[48px] flex-row items-center justify-between rounded-md border bg-[#151D27] px-4 ${isOpen ? "border-[#FF7A00]" : "border-[rgba(255,255,255,0.08)]"} ${disabled ? "opacity-70" : "hover:bg-[#1B2633]"}`}
        disabled={disabled}
        onPress={() => setOpenState(!isOpen)}
        style={noTextSelectionStyle}
      >
        <Text numberOfLines={1} className={`min-w-0 flex-1 text-[16px] font-medium ${selectedOption ? "text-[#E8EAED]" : "text-[#728096]"}`}>
          {loading ? "Ładowanie..." : error ?? selectedOption?.name ?? placeholder}
        </Text>
        <ChevronDown size={19} color={isOpen ? "#FF921F" : "#9AA4B2"} />
      </Pressable>

      {isOpen && options ? (
        <View
          className={`absolute left-0 right-0 ${label ? "top-[74px]" : "top-[50px]"} overflow-hidden rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27]`}
          style={{ zIndex: stackOrder + 100, elevation: stackOrder + 100, boxShadow: "0 16px 28px rgba(0, 0, 0, 0.36)" } as unknown as ViewStyle}
        >
          <ScrollView className="max-h-[240px]" showsVerticalScrollIndicator={false}>
            {options.map((option) => {
              const active = option.id === selectedId;

              return (
                <Pressable
                  key={option.id}
                  className={`min-h-[44px] justify-center border-b border-[rgba(255,255,255,0.08)] px-4 hover:bg-[rgba(255,122,0,0.10)] ${active ? "bg-[rgba(255,122,0,0.12)]" : "bg-[#151D27]"}`}
                  onPress={() => selectOption(option.id)}
                  style={noTextSelectionStyle}
                >
                  <Text numberOfLines={1} className={`text-[14px] font-black ${active ? "text-[#FF921F]" : "text-[#E8EAED]"}`}>
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

function DocumentTypeFilter({
  onSelect,
  selectedType
}: {
  onSelect: (type: DocumentCategoryFilter) => void;
  selectedType: DocumentCategoryFilter;
}) {
  const [open, setOpen] = useState(false);
  const selectedOption = documentCategoryOptions.find((option) => option.id === selectedType) ?? documentCategoryOptions[0];

  function selectOption(type: DocumentCategoryFilter) {
    onSelect(type);
    setOpen(false);
  }

  return (
    <View className="relative w-[210px]" style={{ zIndex: open ? 1200 : 10, elevation: open ? 1200 : 10 }}>
      <Pressable
        className={`h-[42px] flex-row items-center justify-between rounded-md border bg-[#151D27] px-3 ${open ? "border-[#FF7A00]" : "border-[rgba(255,255,255,0.08)]"}`}
        onPress={() => setOpen((current) => !current)}
        style={noTextSelectionStyle}
      >
        <Text numberOfLines={1} className="min-w-0 flex-1 text-[15px] font-medium text-[#E8EAED]">{selectedOption.name}</Text>
        <ChevronDown size={18} color={open ? "#FF921F" : "#6F7A88"} strokeWidth={2.4} />
      </Pressable>

      {open ? (
        <View
          className="absolute left-0 right-0 top-[48px] overflow-hidden rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27]"
          style={{ zIndex: 1300, elevation: 1300, boxShadow: "0 16px 28px rgba(0, 0, 0, 0.36)" } as unknown as ViewStyle}
        >
          <ScrollView className="max-h-[220px]" showsVerticalScrollIndicator={false}>
            {documentCategoryOptions.map((option) => {
              const active = option.id === selectedType;

              return (
                <Pressable
                  key={option.id}
                  className={`min-h-[42px] justify-center border-b border-[rgba(255,255,255,0.08)] px-4 hover:bg-[rgba(255,122,0,0.10)] ${active ? "bg-[rgba(255,122,0,0.12)]" : "bg-[#151D27]"}`}
                  onPress={() => selectOption(option.id)}
                  style={noTextSelectionStyle}
                >
                  <Text numberOfLines={1} className={`text-[13px] font-black ${active ? "text-[#FF921F]" : "text-[#E8EAED]"}`}>{option.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function BasicStep({
  brand,
  brands,
  brandsError,
  brandsLoading,
  deviceTypes,
  deviceTypesError,
  deviceTypesLoading,
  diskImageUrl,
  imageUrl,
  machineType,
  modelCode,
  modelName,
  onBrandSelect,
  onDeviceTypeSelect,
  onDiskImageChange,
  onImageUrlChange,
  onModelCodeChange,
  onModelNameChange
}: {
  brand?: number;
  brands: Brand[];
  brandsError?: string;
  brandsLoading: boolean;
  deviceTypes: DeviceType[];
  deviceTypesError?: string;
  deviceTypesLoading: boolean;
  diskImageUrl: string;
  imageUrl: string;
  machineType?: number;
  modelCode: string;
  modelName: string;
  onBrandSelect: (value?: number) => void;
  onDeviceTypeSelect: (value?: number) => void;
  onDiskImageChange: (value: string) => void;
  onImageUrlChange: (value: string) => void;
  onModelCodeChange: (value: string) => void;
  onModelNameChange: (value: string) => void;
}) {
  const [openSelect, setOpenSelect] = useState<"brand" | "type">();

  useEffect(() => {
    if (Platform.OS !== "web" || !openSelect) return;

    function closeOnOutsidePointerDown(event: PointerEvent) {
      const target = event.target;

      if (target instanceof Element && target.closest('[id="machine-select-root"]')) {
        return;
      }

      setOpenSelect(undefined);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
  }, [openSelect]);

  return (
    <>
      <WizardStepHeader step={1} title="Dodaj maszynę" subtitle="Uzupełnij podstawowe dane modelu i zdjęcie widoczne w katalogu." />

      <View className="relative mt-8" style={{ zIndex: 5000, elevation: 5000 }}>
        <View className={Platform.OS === "web" ? "flex-row" : "items-stretch"} style={[basicStepLayoutStyle, { zIndex: 5000, elevation: 5000 }]}>
          <View className="items-stretch" style={[basicStepColumnStyle, basicStepFieldsStyle, { zIndex: 5000, elevation: 5000 }]}>
            <View className="min-w-0" style={{ zIndex: 100, elevation: 100 }}>
              <InputField label="Nazwa modelu" onChangeText={onModelNameChange} onFocus={() => setOpenSelect(undefined)} placeholder="np. Industrial X-200 Pro" value={modelName} />
            </View>
            <View className="min-w-0" style={{ zIndex: 100, elevation: 100 }}>
              <InputField label="Kod modelu (opcjonalnie)" onChangeText={onModelCodeChange} onFocus={() => setOpenSelect(undefined)} placeholder="np. X200-PRO-24" value={modelCode} />
            </View>
            <View className="min-w-0" style={{ zIndex: openSelect === "brand" ? 6000 : 200, elevation: openSelect === "brand" ? 6000 : 200 }}>
              <SelectField
                error={brandsError}
                label="Producent / marka"
                loading={brandsLoading}
                onOpenChange={(nextOpen) => setOpenSelect(nextOpen ? "brand" : undefined)}
                onSelect={onBrandSelect}
                open={openSelect === "brand"}
                options={brands}
                placeholder="Wybierz producenta"
                stackOrder={30000}
                selectedId={brand}
              />
            </View>
            <View className="min-w-0" style={{ zIndex: openSelect === "type" ? 6000 : 200, elevation: openSelect === "type" ? 6000 : 200 }}>
              <SelectField
                error={deviceTypesError}
                label="Typ maszyny"
                loading={deviceTypesLoading}
                onOpenChange={(nextOpen) => setOpenSelect(nextOpen ? "type" : undefined)}
                onSelect={onDeviceTypeSelect}
                open={openSelect === "type"}
                options={deviceTypes}
                placeholder="Wybierz typ urządzenia"
                stackOrder={30000}
                selectedId={machineType}
              />
            </View>
          </View>
          <View className="min-w-0 gap-6" style={[basicStepColumnStyle, { zIndex: 100, elevation: 100 }]}>
            <InputField
              label="URL zdjęcia (opcjonalnie)"
              onChangeText={onImageUrlChange}
              onFocus={() => setOpenSelect(undefined)}
              placeholder="https://example.com/maszyna.jpg"
              value={imageUrl}
            />
            <MachinePhotoDropZone diskImageUrl={diskImageUrl} onDiskImageChange={onDiskImageChange} />
          </View>
        </View>
      </View>
      <View style={wizardFooterSpacerStyle} />
    </>
  );
}

function DocumentChoiceStep({
  attachments,
  attachmentsError,
  attachmentsLoading,
  search,
  selectedDocumentType,
  selectedAttachmentIds,
  setSelectedDocumentType,
  setSearch,
  toggleAttachment,
  toggleVisibleAttachments
}: {
  attachments: Attachment[];
  attachmentsError?: string;
  attachmentsLoading: boolean;
  search: string;
  selectedDocumentType: DocumentCategoryFilter;
  selectedAttachmentIds: number[];
  setSelectedDocumentType: (type: DocumentCategoryFilter) => void;
  setSearch: (value: string) => void;
  toggleAttachment: (id: number) => void;
  toggleVisibleAttachments: (ids: number[]) => void;
}) {
  const filteredAttachments = useMemo(() => {
    const query = search.trim().toLowerCase();

    return attachments.filter((attachment) => {
      if (selectedDocumentType !== "all" && getDocumentCategory(attachment.original_filename) !== selectedDocumentType) {
        return false;
      }

      if (!query) return true;

      return [attachment.original_filename, String(attachment.id), getDocumentCategory(attachment.original_filename), ...(attachment.devices?.map((device) => device.name) ?? [])]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(query));
    });
  }, [attachments, search, selectedDocumentType]);
  const filteredAttachmentIds = useMemo(() => filteredAttachments.map((attachment) => attachment.id), [filteredAttachments]);
  const allVisibleSelected = filteredAttachmentIds.length > 0 && filteredAttachmentIds.every((id) => selectedAttachmentIds.includes(id));
  const someVisibleSelected = filteredAttachmentIds.some((id) => selectedAttachmentIds.includes(id));

  return (
    <>
      <WizardStepHeader step={2} title="Wybór plików" subtitle="Wybierz dokumenty, które mają zostać przypisane do dodawanej maszyny." />

      <View className="relative mt-8" style={{ zIndex: 50, elevation: 50 }}>
        <View className="relative flex-row items-center gap-3 border-b border-[rgba(255,255,255,0.08)] pb-4" style={{ zIndex: 60, elevation: 60 }}>
          <View className="h-[42px] min-w-[320px] flex-1 flex-row items-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27] px-3">
            <Search size={17} color="#FF7A00" strokeWidth={2.4} />
            <TextInput
              className="ml-3 h-10 flex-1 text-[15px] font-medium text-[#E8EAED] outline-none"
              placeholder="Szukaj po nazwie pliku lub maszynie..."
              placeholderTextColor="#6F7A88"
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <DocumentTypeFilter selectedType={selectedDocumentType} onSelect={setSelectedDocumentType} />
        </View>
      </View>

      <View className="relative" style={{ zIndex: 1, elevation: 1 }}>
        <View className="h-[62px] flex-row items-center border-b border-[rgba(255,255,255,0.08)] px-4">
          <View className="px-1" style={documentSelectColumnStyle}>
            <Pressable
              className={`h-[18px] w-[18px] items-center justify-center rounded border ${
                allVisibleSelected
                  ? "border-[#FF7A00] bg-[#FF7A00]"
                  : someVisibleSelected
                    ? "border-[#FF7A00] bg-[rgba(255,122,0,0.12)]"
                    : "border-[rgba(255,255,255,0.22)]"
              }`}
              onPress={() => toggleVisibleAttachments(filteredAttachmentIds)}
            >
              {allVisibleSelected ? <Check size={13} color="#fff" strokeWidth={4} /> : null}
              {!allVisibleSelected && someVisibleSelected ? <View className="h-[2px] w-2 rounded bg-[#FF921F]" /> : null}
            </Pressable>
          </View>
          <View style={documentIconColumnStyle} />
          <Text className="min-w-0 px-3 text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={documentNameColumnStyle}>Plik</Text>
          <Text className="min-w-0 px-3 text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={documentTypeColumnStyle}>Typ</Text>
          <Text className="min-w-0 px-3 text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={documentMachinesColumnStyle}>Maszyny</Text>
          <Text className="min-w-0 px-3 text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={documentDateColumnStyle}>Dodano</Text>
        </View>

        <View className="pt-2">
          {attachmentsLoading ? <ChoiceEmptyRow label="Ładowanie dokumentów..." /> : null}
          {!attachmentsLoading && attachmentsError ? <ChoiceEmptyRow label={attachmentsError} tone="error" /> : null}
          {!attachmentsLoading && !attachmentsError && filteredAttachments.length === 0 ? <ChoiceEmptyRow label="Brak dokumentów do wyświetlenia." /> : null}
          {!attachmentsLoading && !attachmentsError
            ? filteredAttachments.map((attachment) => (
                <DocumentChoiceRow
                  key={attachment.id}
                  attachment={attachment}
                  selected={selectedAttachmentIds.includes(attachment.id)}
                  onToggle={() => toggleAttachment(attachment.id)}
                />
              ))
            : null}
        </View>
      </View>
      <View style={wizardFooterSpacerStyle} />
    </>
  );
}

function ChoiceEmptyRow({ label, tone }: { label: string; tone?: "error" }) {
  return (
    <View className={`h-[86px] justify-center border-b px-[25px] ${tone === "error" ? "border-b-[#FF7A00]" : "border-b-[rgba(255,255,255,0.08)]"}`}>
      <Text className={`text-[15px] font-semibold ${tone === "error" ? "text-[#FF921F]" : "text-[#E8EAED]"}`}>{label}</Text>
    </View>
  );
}

function DocumentChoiceRow({ attachment, onToggle, selected }: { attachment: Attachment; onToggle: () => void; selected: boolean }) {
  const assignedCount = attachment.devices?.length ?? 0;
  const category = getDocumentCategory(attachment.original_filename);
  const categoryStyle = documentCategoryStyles[category];
  const CategoryIcon = categoryStyle.icon;

  return (
    <Pressable
      className={`group relative h-[78px] flex-row items-center border border-transparent border-b-[rgba(255,255,255,0.08)] px-4 ${
        selected
          ? "rounded-md bg-[rgba(255,122,0,0.06)]"
          : "bg-transparent hover:rounded-md hover:border-[rgba(255,255,255,0.08)] hover:bg-[#1B2633]"
      }`}
      onPress={onToggle}
    >
      <View className="items-start px-1" style={documentSelectColumnStyle}>
        <View className={`h-[18px] w-[18px] items-center justify-center rounded border ${selected ? "border-[#FF7A00] bg-[#FF7A00]" : "border-[rgba(255,255,255,0.22)] bg-transparent"}`}>
          {selected ? <Check size={13} color="#fff" strokeWidth={4} /> : null}
        </View>
      </View>
      <View className="items-start" style={documentIconColumnStyle}>
        <View className="h-[46px] w-[46px] items-center justify-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27]">
          <CategoryIcon size={23} color={categoryStyle.color} strokeWidth={2.4} />
        </View>
      </View>
      <View className="min-w-0 px-3" style={documentNameColumnStyle}>
        <Text numberOfLines={1} className="text-[16px] font-semibold text-[#E8EAED]">{attachment.original_filename}</Text>
      </View>
      <View className="min-w-0 items-start px-3" style={documentTypeColumnStyle}>
        <Text numberOfLines={1} className="text-[15px] font-medium text-[#E8EAED]">{category}</Text>
      </View>
      <View className="min-w-0 items-start px-3" style={documentMachinesColumnStyle}>
        <Text numberOfLines={1} className="text-[15px] font-medium text-[#E8EAED]">{getAssignedMachinesLabel(assignedCount)}</Text>
      </View>
      <Text numberOfLines={1} className="min-w-0 px-3 text-[15px] font-medium text-[#9AA4B2]" style={documentDateColumnStyle}>{formatDate(attachment.created_at)}</Text>
    </Pressable>
  );
}
function SummaryStep({
  brand,
  deviceType,
  imageUrl,
  modelCode,
  modelName,
  selectedAttachments,
  submitError
}: {
  brand?: Brand;
  deviceType?: DeviceType;
  imageUrl: string;
  modelCode: string;
  modelName: string;
  selectedAttachments: Attachment[];
  submitError?: string;
}) {
  const displayName = modelName.trim() || "Industrial X-200 Pro";
  const displayBrand = brand?.name ?? "Brak marki";
  const displayType = deviceType?.name ?? "Brak typu";
  const displayCode = modelCode.trim() || "Nie podano";
  const trimmedImageUrl = imageUrl.trim();
  const displayImageStatus = trimmedImageUrl ? "Podano" : "Nie podano";

  return (
    <>
      <WizardStepHeader step={3} title="Podsumowanie" subtitle="Sprawdź dane maszyny i wybrane pliki przed dodaniem." />

      <View className="mt-5 flex-row items-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27] px-4 py-3">
        <View className="mr-3 h-5 w-5 items-center justify-center rounded-full bg-[rgba(32,226,136,0.12)]">
          <Check size={13} color="#20e288" strokeWidth={3} />
        </View>
        <Text className="text-[14px] font-semibold text-[#9AA4B2]">
          Maszyna zostanie dodana do katalogu z <Text className="font-black text-[#FF921F]">{getSelectedDocumentsLabel(selectedAttachments.length)}</Text>.
        </Text>
      </View>

      <View className="mt-6">
        <View>
          <Text className="mb-3 text-[24px] font-extrabold text-[#E8EAED]">Dane maszyny</Text>
          <View className={trimmedImageUrl ? "flex-row gap-5" : ""}>
            {trimmedImageUrl ? (
              <View className="min-h-[238px] w-[260px] rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27] p-4">
                <View className="h-[190px] overflow-hidden rounded-md border border-[rgba(255,255,255,0.08)] bg-[#111820]">
                  <Image source={{ uri: trimmedImageUrl }} className="h-full w-full" resizeMode="cover" />
                </View>
                <Text numberOfLines={1} className="mt-3 text-[13px] font-black uppercase tracking-[0.7px] text-[#ffb36f]">Podgląd zdjęcia</Text>
              </View>
            ) : null}
            <View className={`min-w-0 flex-1 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27] px-5 py-4 ${trimmedImageUrl ? "min-h-[238px] justify-center" : ""}`}>
              <View className="flex-row gap-8">
                <View className="min-w-0 flex-1">
                  <SummaryRow label="Model" value={displayName} />
                  <SummaryRow label="Kod modelu" value={displayCode} />
                  <SummaryRow label="Producent" value={displayBrand} />
                </View>
                <View className="min-w-0 flex-1">
                  <SummaryRow label="Typ" value={displayType} />
                  <SummaryRow label="Zdjęcie" value={displayImageStatus} />
                  <SummaryRow label="Status" value="Gotowa do dodania" tone="success" />
                </View>
              </View>
            </View>
          </View>
        </View>

        <View className="mt-5">
          <View className="mb-3 flex-row items-center">
            <Text className="text-[24px] font-extrabold text-[#E8EAED]">Wybrane pliki</Text>
          </View>

          <View className="overflow-hidden rounded-md border-b border-[rgba(255,255,255,0.08)]">
            <View className="h-[42px] flex-row items-center border-b border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-3">
              <Text className="min-w-0 flex-[2.2] px-3 text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]">Plik</Text>
              <Text className="min-w-0 flex-[0.9] px-3 text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]">Typ</Text>
              <Text className="min-w-0 flex-[0.9] px-3 text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]">Dodano</Text>
            </View>
            {selectedAttachments.length === 0 ? <ChoiceEmptyRow label="Brak wybranych dokumentów" /> : null}
            {selectedAttachments.map((attachment) => {
              const category = getDocumentCategory(attachment.original_filename);
              const categoryStyle = documentCategoryStyles[category];
              const CategoryIcon = categoryStyle.icon;

              return (
                <View key={attachment.id} className="h-[64px] flex-row items-center border border-transparent border-b-[rgba(255,255,255,0.08)] px-3">
                  <View className="min-w-0 flex-[2.2] flex-row items-center px-3">
                    <View className="mr-3 h-9 w-9 items-center justify-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27]">
                      <CategoryIcon size={19} color={categoryStyle.color} strokeWidth={2.4} />
                    </View>
                    <Text numberOfLines={1} className="min-w-0 flex-1 text-[16px] font-semibold text-[#E8EAED]">{attachment.original_filename}</Text>
                  </View>
                  <Text numberOfLines={1} className="min-w-0 flex-[0.9] px-3 text-[15px] font-medium text-[#E8EAED]">{category}</Text>
                  <Text numberOfLines={1} className="min-w-0 flex-[0.9] px-3 text-[15px] font-medium text-[#9AA4B2]">{formatDate(attachment.created_at)}</Text>
                </View>
              );
            })}
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

function SummaryRow({ label, tone, value }: { label: string; tone?: "success"; value: string }) {
  return (
    <View className="h-[48px] flex-row items-center border-b border-[rgba(255,255,255,0.08)]">
      <Text className="flex-1 text-[15px] font-medium text-[#9AA4B2]">{label}</Text>
      {tone === "success" ? (
        <View className="flex-row items-center">
          <View className="h-2 w-2 rounded-full bg-[#20e288]" />
          <Text numberOfLines={1} className="ml-2 text-[15px] font-black text-[#20e288]">{value}</Text>
        </View>
      ) : (
        <Text numberOfLines={1} className="text-[15px] font-semibold text-[#E8EAED]">{value}</Text>
      )}
    </View>
  );
}

function WizardActionFooter({
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
            {primaryLabel === "Dodaj maszynę" ? <Plus size={19} color="#111820" /> : null}
            <Text className={`${primaryLabel === "Dodaj maszynę" ? "ml-3" : ""} text-[14px] font-black text-[#111820]`}>{primaryLabel}</Text>
            {primaryLabel !== "Dodaj maszynę" ? <ArrowRight size={21} color="#111820" className="ml-4" /> : null}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function AddMachineScreen() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentsError, setAttachmentsError] = useState<string>();
  const [attachmentsLoading, setAttachmentsLoading] = useState(true);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandsError, setBrandsError] = useState<string>();
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [deviceTypesError, setDeviceTypesError] = useState<string>();
  const [deviceTypesLoading, setDeviceTypesLoading] = useState(true);
  const [diskImageUrl, setDiskImageUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [modelCode, setModelCode] = useState("");
  const [modelName, setModelName] = useState("");
  const [documentSearch, setDocumentSearch] = useState("");
  const [selectedDocumentType, setSelectedDocumentType] = useState<DocumentCategoryFilter>("all");
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<number[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<number>();
  const [selectedDeviceTypeId, setSelectedDeviceTypeId] = useState<number>();
  const [submitError, setSubmitError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  useEffect(() => {
    let active = true;

    fetchBrands()
      .then((items) => {
        if (!active) return;
        setBrands(items);
        setBrandsError(undefined);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setBrandsError(error instanceof Error ? error.message : "Nie udało się pobrać marek.");
      })
      .finally(() => {
        if (active) setBrandsLoading(false);
      });

    fetchDeviceTypes()
      .then((items) => {
        if (!active) return;
        setDeviceTypes(items);
        setDeviceTypesError(undefined);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setDeviceTypesError(error instanceof Error ? error.message : "Nie udało się pobrać typów maszyn.");
      })
      .finally(() => {
        if (active) setDeviceTypesLoading(false);
      });

    fetchAttachments()
      .then((items) => {
        if (!active) return;
        setAttachments(items);
        setAttachmentsError(undefined);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setAttachmentsError(error instanceof Error ? error.message : "Nie udało się pobrać dokumentów.");
      })
      .finally(() => {
        if (active) setAttachmentsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const selectedAttachments = useMemo(
    () => attachments.filter((attachment) => selectedAttachmentIds.includes(attachment.id)),
    [attachments, selectedAttachmentIds]
  );
  const selectedBrand = useMemo(() => brands.find((brand) => brand.id === selectedBrandId), [brands, selectedBrandId]);
  const selectedDeviceType = useMemo(
    () => deviceTypes.find((deviceType) => deviceType.id === selectedDeviceTypeId),
    [deviceTypes, selectedDeviceTypeId]
  );
  const basicDataComplete = modelName.trim().length > 0 && !!selectedBrandId && !!selectedDeviceTypeId;

  function toggleAttachment(id: number) {
    setSelectedAttachmentIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleVisibleAttachments(ids: number[]) {
    if (ids.length === 0) return;

    setSelectedAttachmentIds((current) => {
      const visibleIds = new Set(ids);
      const allVisibleSelected = ids.every((id) => current.includes(id));

      if (allVisibleSelected) {
        return current.filter((id) => !visibleIds.has(id));
      }

      return Array.from(new Set([...current, ...ids]));
    });
  }

  async function submitMachine() {
    if (!selectedBrandId || !selectedDeviceTypeId || !modelName.trim()) {
      setSubmitError("Uzupełnij nazwę modelu, markę i typ maszyny.");
      return;
    }

    setSubmitting(true);
    setSubmitError(undefined);

    try {
      const payload: CreateDevicePayload = {
        brand_id: selectedBrandId,
        device_type_id: selectedDeviceTypeId,
        name: modelName.trim()
      };

      const trimmedModelCode = modelCode.trim();
      const trimmedImageUrl = imageUrl.trim();

      if (trimmedModelCode) {
        payload.model_serial_code = trimmedModelCode;
      }

      if (trimmedImageUrl) {
        payload.image_url = trimmedImageUrl;
      }

      const createdDevice = await createDevice(payload);

      if (!createdDevice.id) {
        throw new Error("API nie zwróciło ID utworzonej maszyny.");
      }

      await Promise.all(selectedAttachmentIds.map((attachmentId) => assignAttachmentToDevice(attachmentId, createdDevice.id)));
      router.replace("/catalog");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Nie udało się dodać maszyny.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-[#0B1117]" edges={["top", "left", "right"]}>
      <View className="flex-1 flex-row bg-[#0B1117]">
        <AdminSidebar activeSection="catalog" />

        <View className="relative min-w-0 flex-1" style={adminMainStyle}>
          <ScrollView
            ref={scrollRef}
            className="flex-1"
            contentContainerClassName={Platform.OS === "web" ? undefined : "px-[46px] pb-12 pt-8"}
            contentContainerStyle={scrollContentStyle}
            style={scrollViewStyle}
          >
            <View className={Platform.OS === "web" ? undefined : "w-full"} style={pageShellStyle}>
              {step === 1 ? (
                <BasicStep
                  brand={selectedBrandId}
                  brands={brands}
                  brandsError={brandsError}
                  brandsLoading={brandsLoading}
                  deviceTypes={deviceTypes}
                  deviceTypesError={deviceTypesError}
                  deviceTypesLoading={deviceTypesLoading}
                  diskImageUrl={diskImageUrl}
                  imageUrl={imageUrl}
                  machineType={selectedDeviceTypeId}
                  modelCode={modelCode}
                  modelName={modelName}
                  onBrandSelect={setSelectedBrandId}
                  onDeviceTypeSelect={setSelectedDeviceTypeId}
                  onDiskImageChange={setDiskImageUrl}
                  onImageUrlChange={setImageUrl}
                  onModelCodeChange={setModelCode}
                  onModelNameChange={setModelName}
                />
              ) : null}
              {step === 2 ? (
                <DocumentChoiceStep
                  attachments={attachments}
                  attachmentsError={attachmentsError}
                  attachmentsLoading={attachmentsLoading}
                  search={documentSearch}
                  selectedDocumentType={selectedDocumentType}
                  selectedAttachmentIds={selectedAttachmentIds}
                  setSelectedDocumentType={setSelectedDocumentType}
                  setSearch={setDocumentSearch}
                  toggleAttachment={toggleAttachment}
                  toggleVisibleAttachments={toggleVisibleAttachments}
                />
              ) : null}
              {step === 3 ? (
                <SummaryStep
                  brand={selectedBrand}
                  deviceType={selectedDeviceType}
                  imageUrl={imageUrl}
                  modelCode={modelCode}
                  modelName={modelName}
                  selectedAttachments={selectedAttachments}
                  submitError={submitError}
                />
              ) : null}
            </View>
          </ScrollView>

          {step === 1 ? (
            <WizardActionFooter
              disabled={!basicDataComplete}
              onPrimary={() => setStep(2)}
              onSecondary={() => router.replace("/catalog")}
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
                  Wybrano: <Text className="font-black text-[#FF921F]">{getSelectedDocumentsLabel(selectedAttachmentIds.length)}</Text>
                </Text>
              )}
            />
          ) : null}
          {step === 3 ? (
            <WizardActionFooter
              disabled={submitting}
              onPrimary={submitMachine}
              onSecondary={() => setStep(2)}
              primaryLabel={submitting ? "Dodawanie..." : "Dodaj maszynę"}
              secondaryLabel="Wstecz"
            />
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}



