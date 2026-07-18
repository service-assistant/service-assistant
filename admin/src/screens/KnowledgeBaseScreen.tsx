import {
  CalendarDays,
  ChevronDown,
  FileCog,
  LucideIcon,
  Plus,
  Search,
  ScrollText,
  ShieldAlert,
  Workflow
} from "lucide-react-native";
import { createElement, useEffect, useMemo, useState } from "react";
import { Image, Platform, Pressable, ScrollView, Text, TextInput, View, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Constants from "expo-constants";
import { apiUrl } from "../config/api";
import { AdminSidebar } from "../components/AdminSidebar";

type StatusTone = "ready" | "processing" | "unassigned" | "error";
type DocumentCategory = "Instrukcja" | "Kody błędów" | "Schemat" | "Biuletyn";

const ATTACHMENTS_URL = apiUrl("api/attachments");
const BRANDS_URL = apiUrl("api/brands");
const DEVICES_URL = apiUrl("api/devices");
const WEB_ATTACHMENTS_URL = "/api/attachments";
const WEB_BRANDS_URL = "/api/brands";
const WEB_DEVICES_URL = "/api/devices";
const AUTH_TOKEN =
  ((Constants.expoConfig?.extra as { authToken?: string } | undefined)?.authToken) ??
  process.env.AUTH_TOKEN ??
  process.env.EXPO_PUBLIC_AUTH_TOKEN ??
  "";

const technicalBackgroundStyle =
  Platform.OS === "web"
    ? ({
        backgroundColor: "#0D141C",
        backgroundImage:
          "radial-gradient(circle at top right, rgba(255, 122, 0, 0.12), transparent 35%), linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
        backgroundSize: "auto, 32px 32px, 32px 32px"
      } as ViewStyle)
    : undefined;

const headerAccentStyle =
  Platform.OS === "web"
    ? ({
        backgroundImage: "linear-gradient(90deg, rgba(255, 122, 0, 0.07), rgba(255, 122, 0, 0.015), transparent 64%)"
      } as ViewStyle)
    : undefined;

const knowledgeTableGridStyle =
  Platform.OS === "web"
    ? ({
        alignItems: "center",
        alignContent: "center",
        display: "grid",
        gridTemplateColumns: "2.35fr 0.75fr 1.35fr 0.82fr 1.28fr",
        justifyItems: "stretch"
      } as unknown as ViewStyle)
    : undefined;

const knowledgeTableHeaderDocumentStyle =
  Platform.OS === "web"
    ? ({
        alignItems: "center",
        display: "flex",
        flexDirection: "row",
        height: "100%",
        justifyContent: "flex-start",
        justifySelf: "stretch",
        width: "100%"
      } as unknown as ViewStyle)
    : undefined;

const knowledgeTableCellStyle =
  Platform.OS === "web"
    ? ({
        alignItems: "flex-start",
        display: "flex",
        height: "100%",
        justifySelf: "stretch",
        justifyContent: "center",
        width: "100%"
      } as unknown as ViewStyle)
    : undefined;

const knowledgeTableRowCellStyle =
  Platform.OS === "web"
    ? ({
        alignItems: "center",
        display: "flex",
        height: "100%",
        justifySelf: "stretch",
        justifyContent: "flex-start",
        width: "100%"
      } as unknown as ViewStyle)
    : undefined;

const tableHeaderTextStyle =
  Platform.OS === "web"
    ? ({
        lineHeight: 13
      } as TextStyle)
    : undefined;

type AttachmentResponse = {
  id: number;
  file_global_path?: string;
  original_filename: string;
  created_at: string;
  updated_at?: string;
  devices?: DeviceResponse[];
};

type DeviceResponse = {
  id: number;
  name: string;
  brand_id?: number;
  brand_logo_url?: string;
};

type BrandResponse = {
  id: number;
  logo_url?: string;
};

type CatalogCounts = {
  models: number;
  producers: number;
};

type KnowledgeDocument = {
  id: string;
  title: string;
  category: DocumentCategory;
  machine: string;
  brandLogoUrl?: string;
  modelNames: string[];
  icon: LucideIcon;
  iconColor: string;
  status: string;
  tone: StatusTone;
  date: string;
};

type KnowledgeStats = {
  total: number;
  ready: number;
  attention: number;
  unassigned: number;
};

const DOCUMENT_CATEGORIES: DocumentCategory[] = ["Instrukcja", "Kody błędów", "Schemat", "Biuletyn"];
const ALL_TYPES_FILTER = "Typ: wszystkie";
const ALL_STATUS_FILTER = "Status: wszystkie";
const ALL_MODELS_FILTER = "Model: wszystkie";

const documentCategoryStyles: Record<DocumentCategory, { icon: LucideIcon; color: string; badge: string; text: string }> = {
  Instrukcja: {
    icon: ScrollText,
    color: "#8ed7ff",
    badge: "border-[#245975] bg-[#102c3a]",
    text: "text-[#a9e1ff]"
  },
  "Kody błędów": {
    icon: ShieldAlert,
    color: "#A78BFA",
    badge: "border-[#6750A4] bg-[#251D3F]",
    text: "text-[#D8CCFF]"
  },
  Schemat: {
    icon: Workflow,
    color: "#a7f3d0",
    badge: "border-[#23634b] bg-[#122f25]",
    text: "text-[#b7f7d9]"
  },
  Biuletyn: {
    icon: FileCog,
    color: "#d7c7ff",
    badge: "border-[#544182] bg-[#241d3a]",
    text: "text-[#d7c7ff]"
  }
};

const statusStyles: Record<StatusTone, { chip: string; dot: string; text: string; rail?: string }> = {
  ready: {
    chip: "bg-transparent",
    dot: "bg-[#27d884]",
    text: "text-[#9fb6aa]"
  },
  processing: {
    chip: "border border-[#5d4a23] bg-[#2d2518]",
    dot: "bg-[#f4b044]",
    text: "text-[#ffd18b]"
  },
  unassigned: {
    chip: "bg-transparent",
    dot: "bg-[#FF7A00]",
    text: "text-[#d6b08a]"
  },
  error: {
    chip: "border border-[#8b2e35] bg-[#3c1d22]",
    dot: "bg-[#ff5d5d]",
    text: "text-[#ffaaa8]",
    rail: "border-l-4 border-l-[#ff5d5d]"
  }
};

function formatUploadedDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatSyncTime(value?: Date) {
  if (!value) {
    return "niezsynchronizowano";
  }

  const now = new Date();
  const sameDay =
    value.getFullYear() === now.getFullYear() &&
    value.getMonth() === now.getMonth() &&
    value.getDate() === now.getDate();
  const time = value.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

  if (sameDay) {
    return `dzisiaj ${time}`;
  }

  return value.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatCount(value: number | undefined, fallback = "-") {
  return typeof value === "number" ? String(value) : fallback;
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

function getMachineLabel(devices: DeviceResponse[] = [], brandLogosById = new Map<number, string>()) {
  if (devices.length === 0) {
    return { machine: "Brak przypisania" };
  }

  if (devices.length === 1) {
    const device = devices[0];

    return {
      machine: device.name,
      brandLogoUrl: device.brand_logo_url ?? (device.brand_id ? brandLogosById.get(device.brand_id) : undefined)
    };
  }

  const lastTwoDigits = devices.length % 100;
  const lastDigit = devices.length % 10;
  const suffix = lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14) ? "podłączone maszyny" : "podłączonych maszyn";

  return { machine: `${devices.length} ${suffix}` };
}

function getDocumentStatus(devices: DeviceResponse[] = []) {
  if (devices.length === 0) {
    return { status: "Wymaga przypisania", tone: "unassigned" as const };
  }

  return { status: "Gotowy", tone: "ready" as const };
}

function mapAttachment(attachment: AttachmentResponse, brandLogosById?: Map<number, string>): KnowledgeDocument {
  const devices = attachment.devices ?? [];
  const machineLabel = getMachineLabel(attachment.devices, brandLogosById);
  const documentStatus = getDocumentStatus(attachment.devices);
  const category = getDocumentCategory(attachment.original_filename);
  const categoryStyle = documentCategoryStyles[category];

  return {
    id: String(attachment.id),
    title: attachment.original_filename,
    category,
    ...machineLabel,
    modelNames: devices.map((device) => device.name),
    icon: categoryStyle.icon,
    iconColor: categoryStyle.color,
    ...documentStatus,
    date: formatUploadedDate(attachment.created_at)
  };
}

async function fetchDevicesForAttachment(id: number) {
  const response = await fetch(`${ATTACHMENTS_URL}/${id}/devices`, {
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`
    }
  });

  if (!response.ok) {
    return [] as DeviceResponse[];
  }

  return (await response.json()) as DeviceResponse[];
}

async function fetchBrandLogoMap() {
  try {
    const response = await fetch(Platform.OS === "web" ? WEB_BRANDS_URL : BRANDS_URL, {
      headers: Platform.OS === "web" ? undefined : { Authorization: `Bearer ${AUTH_TOKEN}` }
    });

    if (!response.ok) {
      return new Map<number, string>();
    }

    const brands = (await response.json()) as BrandResponse[];

    return new Map(
      brands
        .filter((brand): brand is BrandResponse & { logo_url: string } => Boolean(brand.logo_url))
        .map((brand) => [brand.id, brand.logo_url])
    );
  } catch {
    return new Map<number, string>();
  }
}

async function fetchKnowledgeDocuments() {
  let response: Response;

  try {
    response = await fetch(Platform.OS === "web" ? WEB_ATTACHMENTS_URL : ATTACHMENTS_URL, {
      headers: Platform.OS === "web" ? undefined : { Authorization: `Bearer ${AUTH_TOKEN}` }
    });
  } catch {
    if (Platform.OS === "web") {
      throw new Error("Nie mogę połączyć się z lokalnym endpointem API. Zrestartuj Expo i odśwież stronę.");
    }

    throw new Error("Nie mogę połączyć się z API dokumentów.");
  }

  if (!response.ok) {
    let detail: string | undefined;

    try {
      const errorBody = (await response.json()) as { detail?: string };
      detail = errorBody.detail;
    } catch {}

    throw new Error(detail ?? `Nie udało się pobrać dokumentów (${response.status}).`);
  }

  let attachments = (await response.json()) as AttachmentResponse[];

  if (Platform.OS !== "web") {
    attachments = await Promise.all(
      attachments.map(async (attachment) => ({
        ...attachment,
        devices: await fetchDevicesForAttachment(attachment.id)
      }))
    );
  }

  const brandLogosById = await fetchBrandLogoMap();

  return attachments.map((attachment) => mapAttachment(attachment, brandLogosById));
}

async function fetchApiListCount(webUrl: string, nativeUrl: string) {
  const response = await fetch(Platform.OS === "web" ? webUrl : nativeUrl, {
    headers: Platform.OS === "web" ? undefined : { Authorization: `Bearer ${AUTH_TOKEN}` }
  });

  if (!response.ok) {
    throw new Error(`Nie udało się pobrać licznika (${response.status}).`);
  }

  return ((await response.json()) as unknown[]).length;
}

async function fetchCatalogModels() {
  const response = await fetch(Platform.OS === "web" ? WEB_DEVICES_URL : DEVICES_URL, {
    headers: Platform.OS === "web" ? undefined : { Authorization: `Bearer ${AUTH_TOKEN}` }
  });

  if (!response.ok) {
    throw new Error(`Nie udało się pobrać modeli (${response.status}).`);
  }

  const devices = (await response.json()) as DeviceResponse[];

  return Array.from(new Set(devices.map((device) => device.name).filter(Boolean))).sort((first, second) =>
    first.localeCompare(second, "pl")
  );
}

async function fetchCatalogCounts(): Promise<CatalogCounts> {
  const [models, producers] = await Promise.all([
    fetchApiListCount(WEB_DEVICES_URL, DEVICES_URL),
    fetchApiListCount(WEB_BRANDS_URL, BRANDS_URL)
  ]);

  return { models, producers };
}

function KnowledgeHeader({
  catalogCounts,
  fileCount,
  lastSync
}: {
  catalogCounts?: CatalogCounts;
  fileCount: number;
  lastSync?: Date;
}) {
  return (
    <View className="mb-6 flex-row items-start rounded-md border-l-2 border-l-[#FF7A00] py-1 pl-4 pr-1" style={headerAccentStyle}>
      <View className="flex-1">
        <Text className="text-[44px] font-black leading-[52px] text-[#E8EAED]">Baza wiedzy</Text>
        <Text className="mt-[2px] max-w-[650px] text-[16px] font-medium leading-[22px] text-[#9AA4B2]">
          Dokumenty, z których korzysta Asystent Serwisanta.
        </Text>
        <Text className="mt-3 text-[13px] font-semibold text-[#9AA4B2]">
          Ostatnia synchronizacja: <Text className="text-[#E8EAED]">{formatSyncTime(lastSync)}</Text> ·{" "}
          <Text className="text-[#E8EAED]">{fileCount}</Text> plików ·{" "}
          <Text className="text-[#E8EAED]">{formatCount(catalogCounts?.models)}</Text> maszyn ·{" "}
          <Text className="text-[#E8EAED]">{formatCount(catalogCounts?.producers)}</Text> producentów
        </Text>
      </View>
    </View>
  );
}

function FilterPanel({
  categories,
  category,
  model,
  models,
  onCategoryChange,
  onModelChange,
  onStatusChange,
  onAddDocument,
  search,
  onSearchChange,
  status
}: {
  categories: string[];
  category: string;
  model: string;
  models: string[];
  onCategoryChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onAddDocument: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  status: string;
}) {
  return (
    <View className="relative mt-7 mb-4" style={{ zIndex: 80, elevation: 80 }}>
      <View className="mb-[14px] flex-row items-end justify-between">
        <View>
          <Text className="text-[24px] font-extrabold text-[#E8EAED]">Dokumenty</Text>
          <Text className="mt-1 text-[13px] font-semibold text-[#9AA4B2]">Lista plików dostępnych dla Asystenta Serwisanta.</Text>
        </View>
        <Pressable
          className="h-10 flex-row items-center justify-center rounded-lg bg-[#FF7A00] px-[18px] hover:bg-[#FF921F]"
          onPress={onAddDocument}
        >
          <Plus size={18} color="#111820" strokeWidth={2.4} />
          <Text className="ml-2 text-[12px] font-extrabold text-[#111820]">Dodaj dokument</Text>
        </Pressable>
      </View>

      <View className="relative flex-row items-center gap-3 border-b border-[rgba(255,255,255,0.08)] pb-4" style={{ zIndex: 90, elevation: 90 }}>
        <View className="h-[42px] min-w-[320px] flex-1 flex-row items-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27] px-3">
          <Search size={17} color="#FF7A00" strokeWidth={2.4} />
          <TextInput
            placeholder="Szukaj po nazwie, modelu, typie..."
            placeholderTextColor="#6F7A88"
            value={search}
            onChangeText={onSearchChange}
            className="ml-3 h-10 flex-1 text-[15px] font-medium text-[#E8EAED] outline-none"
          />
        </View>
        <FilterSelect allLabel={ALL_TYPES_FILTER} options={categories} selectedValue={category} width="w-[170px]" onSelect={onCategoryChange} />
        <FilterSelect
          allLabel={ALL_STATUS_FILTER}
          options={["Gotowy", "Przetwarzanie", "Wymaga przypisania", "Błąd importu"]}
          selectedValue={status}
          width="w-[180px]"
          onSelect={onStatusChange}
        />
        <FilterSelect allLabel={ALL_MODELS_FILTER} options={models} selectedValue={model} width="w-[190px]" onSelect={onModelChange} />
      </View>
    </View>
  );
}

function FilterSelect({
  allLabel,
  onSelect,
  options,
  selectedValue,
  width
}: {
  allLabel: string;
  onSelect: (value: string) => void;
  options: string[];
  selectedValue: string;
  width: string;
}) {
  const [open, setOpen] = useState(false);
  const selectOptions = [allLabel, ...options];

  function selectOption(value: string) {
    onSelect(value);
    setOpen(false);
  }

  return (
    <View className={`relative ${width}`} style={{ zIndex: open ? 1000 : 10, elevation: open ? 1000 : 10 }}>
      <Pressable
        className={`h-[42px] flex-row items-center justify-between rounded-md border bg-[#151D27] px-3 ${
          open ? "border-[#FF7A00]" : "border-[rgba(255,255,255,0.08)]"
        }`}
        onPress={() => setOpen((current) => !current)}
      >
        <Text numberOfLines={1} className="min-w-0 flex-1 text-[15px] font-medium text-[#E8EAED]">
          {selectedValue}
        </Text>
        <ChevronDown size={18} color={open ? "#FF921F" : "#6F7A88"} strokeWidth={2.4} />
      </Pressable>

      {open ? (
        <View
          className="absolute left-0 right-0 top-[48px] overflow-hidden rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27]"
          style={{ zIndex: 1100, elevation: 1100, boxShadow: "0 16px 28px rgba(0, 0, 0, 0.36)" }}
        >
          {selectOptions.map((option) => {
            const active = option === selectedValue;

            return (
              <Pressable
                key={option}
                className={`min-h-[42px] justify-center border-b border-[rgba(255,255,255,0.08)] px-4 ${active ? "bg-[rgba(255,122,0,0.12)]" : "bg-[#151D27]"}`}
                onPress={() => selectOption(option)}
              >
                <Text numberOfLines={1} className={`text-[13px] font-black ${active ? "text-[#FF921F]" : "text-[#E8EAED]"}`}>
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function DashboardStats({ stats }: { stats: KnowledgeStats }) {
  const tiles = [
    {
      label: "Dokumenty",
      value: stats.total,
      description: "plików w bazie",
      icon: FileCog,
      accent: "bg-[#8ed7ff]",
      iconColor: "#8ed7ff",
      detailColor: "text-[#9AA4B2]"
    },
    {
      label: "Gotowe do użycia",
      value: stats.ready,
      description: "dostępne dla asystenta",
      icon: Workflow,
      accent: "bg-[#27d884]",
      iconColor: "#27d884",
      detailColor: "text-[#9AA4B2]"
    },
    {
      label: "Wymagają uwagi",
      value: stats.attention,
      description: "błędów importu",
      icon: ShieldAlert,
      accent: "bg-[#FF7A00]",
      iconColor: "#FF7A00",
      detailColor: stats.attention > 0 ? "text-[#FF921F]" : "text-[#9AA4B2]"
    },
    {
      label: "Nieprzypisane",
      value: stats.unassigned,
      description: "bez modelu",
      icon: ScrollText,
      accent: "bg-[#ff5d5d]",
      iconColor: "#ff5d5d",
      detailColor: stats.unassigned > 0 ? "text-[#ffaaa8]" : "text-[#9AA4B2]"
    }
  ];

  return (
    <View className="mb-8 flex-row gap-3">
      {tiles.map((tile) => {
        const Icon = tile.icon;

        return (
          <View key={tile.label} className="h-[88px] flex-1 justify-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27] px-5">
            <View className="mb-2 flex-row items-center justify-between">
              <View className="min-w-0 flex-1 flex-row items-center">
                <View className={`mr-2 h-[7px] w-[7px] rounded-full ${tile.accent}`} />
                <Text numberOfLines={1} className="text-[13px] font-black text-[#E8EAED]">
                  {tile.label}
                </Text>
              </View>
              <Icon size={18} color={tile.iconColor} strokeWidth={2.3} />
            </View>
            <View className="flex-row items-baseline">
              <Text className="mr-2 text-[30px] font-black leading-[32px] text-[#E8EAED]">{tile.value}</Text>
              <Text numberOfLines={1} className={`min-w-0 flex-1 text-[12px] font-semibold ${tile.detailColor}`}>
                {tile.description}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function DocumentTable({
  documents,
  error,
  loading
}: {
  documents: KnowledgeDocument[];
  error?: string;
  loading: boolean;
}) {
  return (
    <View>
      <View className="h-[42px] border-b border-[rgba(255,255,255,0.08)] px-4" style={knowledgeTableGridStyle}>
        <View className="flex-row" style={knowledgeTableHeaderDocumentStyle}>
          <View className="w-[63px] shrink-0" />
          <Text className="text-left text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={tableHeaderTextStyle}>
            Dokument
          </Text>
        </View>
        <View style={knowledgeTableCellStyle}>
          <Text className="self-start text-left text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={tableHeaderTextStyle}>Typ</Text>
        </View>
        <View style={knowledgeTableCellStyle}>
          <Text className="self-start text-left text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={tableHeaderTextStyle}>Powiązane maszyny</Text>
        </View>
        <View style={knowledgeTableCellStyle}>
          <Text className="self-start text-left text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={tableHeaderTextStyle}>Stan importu</Text>
        </View>
        <View style={knowledgeTableCellStyle}>
          <Text className="self-start text-left text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={tableHeaderTextStyle}>Dodano</Text>
        </View>
      </View>

      <View className="pt-2">
        {loading ? <EmptyTableMessage title="Ładowanie dokumentów..." /> : null}
        {!loading && error ? <EmptyTableMessage title={error} tone="error" /> : null}
        {!loading && !error && documents.length === 0 ? <EmptyTableMessage title="Brak dokumentów do wyświetlenia." /> : null}
        {!loading && !error
          ? documents.map((document) => (
              <DocumentRow key={document.id} document={document} />
            ))
          : null}
      </View>
    </View>
  );
}

function EmptyTableMessage({ title, tone }: { title: string; tone?: "error" }) {
  return (
    <View className={`h-[86px] justify-center border-b px-[25px] ${tone === "error" ? "border-b-[#FF7A00]" : "border-b-[rgba(255,255,255,0.08)]"}`}>
      <Text className={`text-[15px] font-semibold ${tone === "error" ? "text-[#FF921F]" : "text-[#E8EAED]"}`}>{title}</Text>
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
        maxWidth: 96,
        objectFit: "contain",
        objectPosition: "left center",
        width: "auto"
      }
    });
  }

  return <Image source={{ uri }} className="h-[18px] w-[96px]" resizeMode="contain" />;
}

function DocumentRow({ document }: { document: KnowledgeDocument }) {
  const Icon = document.icon;
  const tone = statusStyles[document.tone];
  const categoryStyle = documentCategoryStyles[document.category];

  return (
    <Pressable
      onPress={() => router.push(`/documents/${document.id}`)}
      className={`group relative h-[88px] border border-transparent border-b-[rgba(255,255,255,0.08)] bg-transparent px-4 hover:rounded-md hover:border-[rgba(255,255,255,0.08)] hover:border-l-[#FF7A00] hover:bg-[#1B2633] ${
        tone.rail ?? ""
      }`}
      style={knowledgeTableGridStyle}
    >
      <View className="flex-row items-center" style={knowledgeTableRowCellStyle}>
        <View className="h-[46px] w-[46px] items-center justify-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27]">
          <Icon size={25} color={document.iconColor} strokeWidth={2.3} />
          {document.tone === "processing" ? <View className="absolute bottom-0 h-[3px] w-[24px] rounded bg-[#FF7A00]" /> : null}
        </View>
        <View className="ml-[17px] min-w-0 flex-1">
          <Text numberOfLines={1} className="text-[16px] font-semibold text-[#E8EAED]">
            {document.title}
          </Text>
        </View>
      </View>

      <View style={knowledgeTableCellStyle}>
        <View className={`self-start rounded border px-2 py-[3px] ${categoryStyle.badge}`}>
          <Text numberOfLines={1} className={`text-[11px] font-black ${categoryStyle.text}`}>
            {document.category}
          </Text>
        </View>
      </View>

      <View className="min-w-0 flex-row items-center" style={knowledgeTableRowCellStyle}>
        {document.brandLogoUrl ? <RelatedMachineBrandLogo uri={document.brandLogoUrl} /> : null}
        <Text numberOfLines={1} className={`${document.brandLogoUrl ? "ml-3" : ""} min-w-0 flex-1 text-[15px] font-medium leading-[20px] text-[#E8EAED]`}>
          {document.machine}
        </Text>
      </View>

      <View style={knowledgeTableCellStyle}>
        <View className={`self-start flex-row items-center rounded-full px-2.5 py-[5px] ${tone.chip}`}>
          <View className={`mr-2 h-[7px] w-[7px] rounded-full ${tone.dot}`} />
          <Text numberOfLines={1} className={`text-[12px] font-black leading-[14px] ${tone.text}`}>
            {document.status}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center pr-16" style={knowledgeTableRowCellStyle}>
        <CalendarDays size={16} color="#FF7A00" />
        <Text numberOfLines={1} className="ml-2 text-[13px] font-medium text-[#9AA4B2]">{document.date}</Text>
      </View>

      <View className="absolute right-4 opacity-0 group-hover:opacity-100">
        <Text className="text-[12px] font-black text-[#FF921F]">Otwórz</Text>
      </View>

    </Pressable>
  );
}

export function KnowledgeBaseScreen() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL_TYPES_FILTER);
  const [statusFilter, setStatusFilter] = useState(ALL_STATUS_FILTER);
  const [modelFilter, setModelFilter] = useState(ALL_MODELS_FILTER);
  const [lastSync, setLastSync] = useState<Date>();
  const [catalogCounts, setCatalogCounts] = useState<CatalogCounts>();
  const [catalogModels, setCatalogModels] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    fetchKnowledgeDocuments()
      .then((items) => {
        if (!active) return;
        setDocuments(items);
        setError(undefined);
        setLastSync(new Date());
      })
      .catch((fetchError: unknown) => {
        if (!active) return;
        setError(fetchError instanceof Error ? fetchError.message : "Nie udało się pobrać dokumentów.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    fetchCatalogCounts()
      .then((counts) => {
        if (!active) return;
        setCatalogCounts(counts);
      })
      .catch(() => {});

    fetchCatalogModels()
      .then((modelNames) => {
        if (!active) return;
        setCatalogModels(modelNames);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const categories = useMemo(() => DOCUMENT_CATEGORIES, []);

  const stats = useMemo(
    () => ({
      total: documents.length,
      ready: documents.filter((document) => document.tone === "ready").length,
      attention: documents.filter((document) => document.tone !== "ready").length,
      unassigned: documents.filter((document) => document.tone === "unassigned").length
    }),
    [documents]
  );

  const filteredDocuments = useMemo(() => {
    const query = search.trim().toLowerCase();

    return documents.filter((document) => {
      if (category !== ALL_TYPES_FILTER && document.category !== category) return false;
      if (statusFilter !== ALL_STATUS_FILTER && document.status !== statusFilter) return false;
      if (modelFilter !== ALL_MODELS_FILTER && !document.modelNames.includes(modelFilter)) return false;
      if (!query) return true;

      return [document.title, document.category, document.machine, ...document.modelNames, document.date]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query));
    });
  }, [category, documents, modelFilter, search, statusFilter]);

  return (
    <SafeAreaView className="flex-1 bg-[#0D141C]" edges={["top", "left", "right"]}>
      <View className="flex-1 flex-row bg-[#0D141C]" style={technicalBackgroundStyle}>
        <AdminSidebar activeSection="knowledge" />

        <ScrollView className="min-w-0 flex-1" contentContainerClassName="px-[34px] pb-12 pt-[37px]">
          <KnowledgeHeader catalogCounts={catalogCounts} fileCount={documents.length} lastSync={lastSync} />

          <DashboardStats stats={stats} />
          <FilterPanel
            categories={categories}
            category={category}
            model={modelFilter}
            models={catalogModels}
            onCategoryChange={setCategory}
            onModelChange={setModelFilter}
            onStatusChange={setStatusFilter}
            onAddDocument={() => router.push("/add-document")}
            search={search}
            onSearchChange={setSearch}
            status={statusFilter}
          />
          <View className="relative" style={{ zIndex: 1, elevation: 1 }}>
            <DocumentTable documents={filteredDocuments} error={error} loading={loading} />
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
