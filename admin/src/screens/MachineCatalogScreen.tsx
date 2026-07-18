import Constants from "expo-constants";
import { apiUrl } from "../config/api";
import { router, useLocalSearchParams } from "expo-router";
import { createElement, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  FileText,
  Forklift,
  Hammer,
  Layers3,
  Plus,
  Search
} from "lucide-react-native";
import { Image, Platform, Pressable, ScrollView, Text, TextInput, View, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdminSidebar } from "../components/AdminSidebar";

type CatalogTab = "brands" | "machineTypes" | "models";

function getCatalogTabParam(value: unknown): CatalogTab | undefined {
  const tab = Array.isArray(value) ? value[0] : value;
  return tab === "brands" || tab === "machineTypes" || tab === "models" ? tab : undefined;
}

type BrandResponse = {
  id: number;
  name: string;
  logo_url?: string;
};

type DeviceTypeResponse = {
  id: number;
  name: string;
};

type DeviceResponse = {
  id: number;
  name: string;
  model_serial_code?: string;
  image_url?: string;
  brand_id?: number;
  device_type_id?: number;
};

type AttachmentResponse = {
  id: number;
  devices?: DeviceResponse[];
};

type Brand = BrandResponse & {
  count: number;
  mark: string;
};

type MachineType = DeviceTypeResponse & {
  count: number;
  mark: string;
};

type MachineModel = {
  id: number;
  name: string;
  producer: string;
  modelSerialCode?: string;
  brandId?: number;
  type: string;
  typeId?: number;
  documents: number;
  status: "active" | "unassigned" | "withdrawn";
  imageUrl?: string;
  brandLogoUrl?: string;
  brandMark: string;
};

const ATTACHMENTS_URL = apiUrl("api/attachments");
const BRANDS_URL = apiUrl("api/brands");
const DEVICE_TYPES_URL = apiUrl("api/device_types");
const DEVICES_URL = apiUrl("api/devices");
const WEB_ATTACHMENTS_URL = "/api/attachments";
const WEB_BRANDS_URL = "/api/brands";
const WEB_DEVICE_TYPES_URL = "/api/device_types";
const WEB_DEVICES_URL = "/api/devices";
const AUTH_TOKEN =
  ((Constants.expoConfig?.extra as { authToken?: string } | undefined)?.authToken) ??
  process.env.AUTH_TOKEN ??
  process.env.EXPO_PUBLIC_AUTH_TOKEN ??
  "";

const brandTableCellStyle =
  Platform.OS === "web"
    ? ({
        display: "flex",
        alignItems: "flex-start",
        height: "100%",
        justifyContent: "center",
        minWidth: 0,
        width: "100%"
      } as unknown as ViewStyle)
    : undefined;

const tableHeaderTextStyle =
  Platform.OS === "web"
    ? ({
        lineHeight: 13
      } as TextStyle)
    : undefined;

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

function getApiHeaders() {
  return Platform.OS === "web" ? undefined : { Authorization: `Bearer ${AUTH_TOKEN}` };
}

async function fetchJson<T>(webUrl: string, nativeUrl: string, errorLabel: string) {
  const response = await fetch(Platform.OS === "web" ? webUrl : nativeUrl, {
    headers: getApiHeaders()
  });

  if (!response.ok) {
    let detail: string | undefined;
    try {
      detail = ((await response.json()) as { detail?: string }).detail;
    } catch {}
    throw new Error(detail ?? `Nie udalo sie pobrac danych: ${errorLabel} (${response.status}).`);
  }

  return (await response.json()) as T;
}

async function fetchDevicesForAttachment(id: number) {
  const response = await fetch(`${ATTACHMENTS_URL}/${id}/devices`, {
    headers: getApiHeaders()
  });

  if (!response.ok) {
    return [] as DeviceResponse[];
  }

  return (await response.json()) as DeviceResponse[];
}

async function fetchAttachmentsWithDevices() {
  const attachments = await fetchJson<AttachmentResponse[]>(WEB_ATTACHMENTS_URL, ATTACHMENTS_URL, "dokumenty");

  if (Platform.OS === "web") {
    return attachments;
  }

  return Promise.all(
    attachments.map(async (attachment) => ({
      ...attachment,
      devices: attachment.devices ?? (await fetchDevicesForAttachment(attachment.id))
    }))
  );
}

function getMark(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function countById(devices: DeviceResponse[], field: "brand_id" | "device_type_id") {
  const counts = new Map<number, number>();
  devices.forEach((device) => {
    const id = device[field];
    if (!id) return;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  });
  return counts;
}

function CatalogPageHeader({ brandCount, modelCount, typeCount }: { brandCount: number; modelCount: number; typeCount: number }) {
  return (
    <View className="mb-6 flex-row items-start rounded-md border-l-2 border-l-[#FF7A00] py-1 pl-4 pr-1" style={headerAccentStyle}>
      <View className="flex-1">
        <Text className="text-[44px] font-black leading-[52px] text-[#E8EAED]">Katalog maszyn</Text>
        <Text className="mt-[2px] max-w-[720px] text-[16px] font-medium leading-[22px] text-[#9AA4B2]">
          Zarządzaj markami, typami i modelami maszyn używanymi w dokumentach oraz asystencie.
        </Text>
        <Text className="mt-3 text-[13px] font-semibold text-[#9AA4B2]">
          <Text className="text-[#E8EAED]">{brandCount}</Text> marek ·{" "}
          <Text className="text-[#E8EAED]">{typeCount}</Text> typów ·{" "}
          <Text className="text-[#E8EAED]">{modelCount}</Text> modeli
        </Text>
      </View>
    </View>
  );
}

function CatalogStats({
  brandCount,
  modelCount,
  typeCount,
  unassignedCount
}: {
  brandCount: number;
  modelCount: number;
  typeCount: number;
  unassignedCount: number;
}) {
  const tiles = [
    {
      label: "Marki",
      value: brandCount,
      description: "aktywnych",
      icon: Building2,
      accent: "bg-[#8ed7ff]",
      iconColor: "#8ed7ff",
      detailColor: "text-[#9AA4B2]"
    },
    {
      label: "Typy maszyn",
      value: typeCount,
      description: "kategorie",
      icon: Layers3,
      accent: "bg-[#A78BFA]",
      iconColor: "#A78BFA",
      detailColor: "text-[#9AA4B2]"
    },
    {
      label: "Modele",
      value: modelCount,
      description: "w katalogu",
      icon: Hammer,
      accent: "bg-[#27d884]",
      iconColor: "#27d884",
      detailColor: "text-[#9AA4B2]"
    },
    {
      label: "Nieprzypisane",
      value: unassignedCount,
      description: "wymagają uwagi",
      icon: AlertTriangle,
      accent: "bg-[#ff5d5d]",
      iconColor: "#ff5d5d",
      detailColor: "text-[#ffaaa8]"
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

function Tabs({ activeTab, onChange }: { activeTab: CatalogTab; onChange: (tab: CatalogTab) => void }) {
  const tabs: Array<{ id: CatalogTab; label: string }> = [
    { id: "models", label: "Modele maszyn" },
    { id: "brands", label: "Marki" },
    { id: "machineTypes", label: "Typy maszyn" }
  ];

  return (
    <View className="mt-7 flex-row border-b border-[#2a333f]">
      {tabs.map((tab) => {
        const active = activeTab === tab.id;

        return (
          <Pressable
            key={tab.id}
            className={`mr-6 pb-3 ${active ? "border-b-2 border-b-[#ff9300]" : ""}`}
            onPress={() => onChange(tab.id)}
          >
            <Text className={`text-[16px] font-black ${active ? "text-[#ffb36f]" : "text-[#dfe7f2]"}`}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function CatalogHeader({ activeTab, count }: { activeTab: CatalogTab; count: number }) {
  const copy = {
    brands: { count: `Aktywne marki: ${count}`, action: "Dodaj marke" },
    machineTypes: { count: `Aktywne typy maszyn: ${count}`, action: "Dodaj typ" },
    models: { count: `Wszystkie maszyny: ${count}`, action: "Dodaj maszyne" }
  }[activeTab];

  return (
    <View className="mt-[27px] h-[53px] flex-row items-center rounded-md border border-[#2d3745] bg-[#1a212b] px-5">
      <Text className="text-[12px] font-black text-[#f3d6bd]">{copy.count}</Text>
      <Pressable
        className="ml-auto h-[33px] flex-row items-center rounded-md bg-[#ff8a00] px-4"
        onPress={activeTab === "models" ? () => router.push("/add-machine") : undefined}
      >
        <Plus size={15} color="#111820" />
        <Text className="ml-2 text-[11px] font-black uppercase tracking-[0.5px] text-[#111820]">{copy.action}</Text>
      </Pressable>
    </View>
  );
}

function CatalogRow({ item, subtitle }: { item: Brand | MachineType; subtitle: string }) {
  const isBrand = "logo_url" in item;

  return (
    <View className="h-[79px] flex-row items-center rounded-md border border-[#2d3745] bg-[#1a212b] px-[14px]">
      <View className="h-[50px] w-[132px] items-start justify-center overflow-hidden rounded bg-[#0c1219] px-3">
        {isBrand && item.logo_url ? (
          <AutoWidthLogo uri={item.logo_url} height={20} maxWidth={112} />
        ) : (
          <View className="h-[36px] w-[36px] items-center justify-center rounded bg-[#111a21]">
            <Text className="text-[17px] font-black text-[#ff9300]">{item.mark}</Text>
          </View>
        )}
      </View>
      <View className="ml-[15px] flex-1">
        <Text className="text-[18px] font-black text-[#cfd6df]">{item.name}</Text>
        <Text className="mt-1 text-[12px] font-black text-[#b8b0aa]">{subtitle}</Text>
      </View>
      <View className="pr-2">
        <Text className="text-[12px] font-black text-[#FF921F]">Otworz</Text>
      </View>
    </View>
  );
}

function getModelCountLabel(count: number) {
  if (count === 1) return "1 model";
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  const suffix = lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14) ? "modele" : "modeli";
  return `${count} ${suffix}`;
}

function AutoWidthLogo({ height, maxWidth, uri }: { height: number; maxWidth: number; uri: string }) {
  if (Platform.OS === "web") {
    return createElement("img", {
      alt: "",
      src: uri,
      style: {
        display: "block",
        height,
        maxWidth,
        objectFit: "contain",
        objectPosition: "left center",
        width: "auto"
      }
    });
  }

  return <Image source={{ uri }} style={{ height, width: maxWidth }} resizeMode="contain" />;
}

function BrandLogo({ brand }: { brand: Brand }) {
  if (brand.logo_url) {
    return (
      <View className="h-[42px] max-w-[112px] items-start justify-center">
        <AutoWidthLogo uri={brand.logo_url} height={20} maxWidth={112} />
      </View>
    );
  }

  return (
    <View className="h-[38px] w-[38px] items-center justify-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#111a21]">
      <Text className="text-[15px] font-black text-[#FF921F]">{brand.mark}</Text>
    </View>
  );
}

function MachineBrandLogo({ logoUrl, mark }: { logoUrl?: string; mark: string }) {
  if (logoUrl) {
    return (
      <View className="h-[42px] max-w-[112px] items-start justify-center">
        <AutoWidthLogo uri={logoUrl} height={20} maxWidth={112} />
      </View>
    );
  }

  return (
    <View className="h-[38px] w-[38px] items-center justify-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#111a21]">
      <Text className="text-[15px] font-black text-[#FF921F]">{mark}</Text>
    </View>
  );
}

function BrandsPanel({ brands }: { brands: Brand[] }) {
  const [search, setSearch] = useState("");
  const filteredBrands = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return brands;
    return brands.filter((brand) => brand.name.toLowerCase().includes(query));
  }, [brands, search]);

  return (
    <View className="relative mt-7" style={{ zIndex: 40, elevation: 40 }}>
      <View className="mb-[14px] flex-row items-end justify-between">
        <View>
          <Text className="text-[24px] font-extrabold text-[#E8EAED]">Marki</Text>
          <Text className="mt-1 text-[13px] font-semibold text-[#9AA4B2]">Lista producentów dostępnych przy dodawaniu modeli i dokumentów.</Text>
        </View>
        <Pressable
          className="h-10 flex-row items-center justify-center rounded-lg bg-[#FF7A00] px-[18px] hover:bg-[#FF921F]"
          onPress={() => router.push("/brands/new")}
        >
          <Plus size={18} color="#111820" strokeWidth={2.4} />
          <Text className="ml-2 text-[12px] font-extrabold text-[#111820]">Dodaj markę</Text>
        </Pressable>
      </View>


      <View className="relative flex-row items-center gap-3 border-b border-[rgba(255,255,255,0.08)] pb-4" style={{ zIndex: 50, elevation: 50 }}>
        <View className="h-[42px] min-w-[320px] flex-1 flex-row items-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27] px-3">
          <Search size={17} color="#FF7A00" strokeWidth={2.4} />
          <TextInput
            className="ml-3 h-10 flex-1 text-[15px] font-medium text-[#E8EAED] outline-none"
            placeholder="Szukaj po nazwie marki..."
            placeholderTextColor="#6F7A88"
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <View>
        <View className="h-[62px] flex-row items-center border-b border-[rgba(255,255,255,0.08)] px-4 pr-36">
          <View className="h-full flex-1 items-start justify-center" style={brandTableCellStyle}>
            <Text className="min-w-0 text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={tableHeaderTextStyle}>Marka</Text>
          </View>
          <View className="h-full flex-1 items-start justify-center" style={brandTableCellStyle}>
            <Text className="min-w-0 text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={tableHeaderTextStyle}>Logo</Text>
          </View>
          <View className="h-full flex-1 items-start justify-center" style={brandTableCellStyle}>
            <Text className="min-w-0 text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={tableHeaderTextStyle}>Powiązane modele</Text>
          </View>
        </View>

        <View className="pt-2">
          {filteredBrands.length === 0 ? <EmptyState label="Brak marek do wyświetlenia." /> : null}
          {filteredBrands.map((brand) => (
          <Pressable
            key={brand.id}
            className="group relative h-[88px] flex-row items-center border border-transparent border-b-[rgba(255,255,255,0.08)] bg-transparent px-4 pr-36 hover:rounded-md hover:border-[rgba(255,255,255,0.08)] hover:border-l-[#FF7A00] hover:bg-[#1B2633]"
            onPress={() => router.push(`/brands/${brand.id}`)}
          >
            <View className="h-full flex-1 items-start justify-center" style={brandTableCellStyle}>
              <Text numberOfLines={1} className="min-w-0 pr-6 text-[16px] font-semibold text-[#E8EAED]">{brand.name}</Text>
            </View>
            <View className="h-full flex-1 items-start justify-center" style={brandTableCellStyle}>
              <BrandLogo brand={brand} />
            </View>
            <View className="h-full flex-1 items-start justify-center" style={brandTableCellStyle}>
              <Text numberOfLines={1} className="min-w-0 text-[15px] font-medium text-[#E8EAED]">{getModelCountLabel(brand.count)}</Text>
            </View>
            <View className="absolute right-4 flex-row gap-4 opacity-0 group-hover:opacity-100">
              <Text className="text-[12px] font-black text-[#FF921F]">Otworz</Text>
            </View>
          </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function MachineTypesPanel({ machineTypes }: { machineTypes: MachineType[] }) {
  const [search, setSearch] = useState("");
  const filteredTypes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return machineTypes;
    return machineTypes.filter((machineType) => machineType.name.toLowerCase().includes(query));
  }, [machineTypes, search]);

  return (
    <View className="relative mt-7" style={{ zIndex: 40, elevation: 40 }}>
      <View className="mb-[14px] flex-row items-end justify-between">
        <View>
          <Text className="text-[24px] font-extrabold text-[#E8EAED]">Typy maszyn</Text>
          <Text className="mt-1 text-[13px] font-semibold text-[#9AA4B2]">Kategorie uzywane przy grupowaniu modeli i filtrowaniu dokumentow.</Text>
        </View>
        <Pressable
          className="h-10 flex-row items-center justify-center rounded-lg bg-[#FF7A00] px-[18px] hover:bg-[#FF921F]"
          onPress={() => router.push("/machine-types/new")}
        >
          <Plus size={18} color="#111820" strokeWidth={2.4} />
          <Text className="ml-2 text-[12px] font-extrabold text-[#111820]">Dodaj typ</Text>
        </Pressable>
      </View>

      <View className="relative flex-row items-center gap-3 border-b border-[rgba(255,255,255,0.08)] pb-4" style={{ zIndex: 50, elevation: 50 }}>
        <View className="h-[42px] min-w-[320px] flex-1 flex-row items-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27] px-3">
          <Search size={17} color="#FF7A00" strokeWidth={2.4} />
          <TextInput
            className="ml-3 h-10 flex-1 text-[15px] font-medium text-[#E8EAED] outline-none"
            placeholder="Szukaj po nazwie typu..."
            placeholderTextColor="#6F7A88"
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <View>
        <View className="h-[62px] flex-row items-center border-b border-[rgba(255,255,255,0.08)] px-4 pr-36">
          <View className="h-full flex-1 items-start justify-center" style={brandTableCellStyle}>
            <Text className="min-w-0 text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={tableHeaderTextStyle}>Typ maszyny</Text>
          </View>
          <View className="h-full flex-1 items-start justify-center" style={brandTableCellStyle}>
            <Text className="min-w-0 text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={tableHeaderTextStyle}>Powiazane modele</Text>
          </View>
        </View>

        <View className="pt-2">
          {filteredTypes.length === 0 ? <EmptyState label="Brak typow maszyn do wyswietlenia." /> : null}
          {filteredTypes.map((machineType) => (
            <Pressable
              key={machineType.id}
              className="group relative h-[88px] flex-row items-center border border-transparent border-b-[rgba(255,255,255,0.08)] bg-transparent px-4 pr-36 hover:rounded-md hover:border-[rgba(255,255,255,0.08)] hover:border-l-[#FF7A00] hover:bg-[#1B2633]"
              onPress={() => router.push(`/machine-types/${machineType.id}`)}
            >
              <View className="h-full flex-1 items-start justify-center" style={brandTableCellStyle}>
                <Text numberOfLines={1} className="min-w-0 pr-6 text-[16px] font-semibold text-[#E8EAED]">{machineType.name}</Text>
              </View>
              <View className="h-full flex-1 items-start justify-center" style={brandTableCellStyle}>
                <Text numberOfLines={1} className="min-w-0 text-[15px] font-medium text-[#E8EAED]">{getModelCountLabel(machineType.count)}</Text>
              </View>
              <View className="absolute right-4 flex-row gap-4 opacity-0 group-hover:opacity-100">
                <Text className="text-[12px] font-black text-[#FF921F]">Otworz</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}


function ModelFilters({
  brands,
  machineTypes,
  search,
  selectedBrandId,
  selectedTypeId,
  setSearch,
  setSelectedBrandId,
  setSelectedTypeId
}: {
  brands: Brand[];
  machineTypes: MachineType[];
  search: string;
  selectedBrandId?: number;
  selectedTypeId?: number;
  setSearch: (value: string) => void;
  setSelectedBrandId: (value?: number) => void;
  setSelectedTypeId: (value?: number) => void;
}) {
  return (
    <View className="relative flex-row items-center gap-3 border-b border-[rgba(255,255,255,0.08)] pb-4" style={{ zIndex: 50, elevation: 50 }}>
      <View className="h-[42px] min-w-[320px] flex-1 flex-row items-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27] px-3">
        <Search size={17} color="#FF7A00" strokeWidth={2.4} />
        <TextInput
          className="ml-3 h-10 flex-1 text-[15px] font-medium text-[#E8EAED] outline-none"
          placeholder="Szukaj po nazwie modelu..."
          placeholderTextColor="#6F7A88"
          value={search}
          onChangeText={setSearch}
        />
      </View>
      <FilterSelect label="Producent" options={brands} selectedId={selectedBrandId} onSelect={setSelectedBrandId} />
      <FilterSelect label="Typ maszyny" options={machineTypes} selectedId={selectedTypeId} onSelect={setSelectedTypeId} />
    </View>
  );
}

function FilterSelect({
  label,
  onSelect,
  options,
  selectedId
}: {
  label: string;
  onSelect: (id?: number) => void;
  options: Array<{ id: number; name: string }>;
  selectedId?: number;
}) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => option.id === selectedId);
  const dropdownOptions = [{ id: undefined, name: label }, ...options] as Array<{ id?: number; name: string }>;

  function selectOption(id?: number) {
    onSelect(id);
    setOpen(false);
  }

  return (
    <View className="relative w-[188px]" style={{ zIndex: open ? 1000 : 10, elevation: open ? 1000 : 10 }}>
      <Pressable
        className={`h-[42px] flex-row items-center justify-between rounded-md border bg-[#151D27] px-3 ${open ? "border-[#FF7A00]" : "border-[rgba(255,255,255,0.08)]"}`}
        onPress={() => setOpen((current) => !current)}
      >
        <Text numberOfLines={1} className="min-w-0 flex-1 text-[15px] font-semibold text-[#e8eef7]">
          {selectedOption?.name ?? label}
        </Text>
        <ChevronDown size={18} color={open ? "#FF921F" : "#6F7A88"} />
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

function MachineModelRow({ model }: { model: MachineModel }) {
  const active = model.status === "active";
  const statusLabel = active ? "Aktywna" : model.status === "unassigned" ? "Nieprzypisana" : "Wycofana";

  return (
    <Pressable
      className="group relative h-[88px] flex-row items-center border border-transparent border-b-[rgba(255,255,255,0.08)] bg-transparent px-4 pr-20 hover:rounded-md hover:border-[rgba(255,255,255,0.08)] hover:border-l-[#FF7A00] hover:bg-[#1B2633]"
      onPress={() => router.push(`/machines/${model.id}`)}
    >
      <View className="min-w-0 flex-[1.35] flex-row items-center">
        <View className="h-[46px] w-[58px] items-center justify-center overflow-hidden rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27]">
          {model.imageUrl ? <Image source={{ uri: model.imageUrl }} className="h-full w-full" resizeMode="cover" /> : <Forklift size={24} color="#FF921F" />}
        </View>
        <View className="ml-4 min-w-0 flex-1">
          <Text numberOfLines={1} className="text-[16px] font-semibold text-[#E8EAED]">{model.name}</Text>
          {model.modelSerialCode ? (
            <Text numberOfLines={1} className="mt-[4px] text-[13px] font-medium text-[#9AA4B2]">{model.modelSerialCode}</Text>
          ) : null}
        </View>
      </View>
      <View className="min-w-0 flex-[0.72] justify-center">
        <MachineBrandLogo logoUrl={model.brandLogoUrl} mark={model.brandMark} />
      </View>
      <Text numberOfLines={1} className="min-w-0 flex-1 text-[15px] font-medium text-[#E8EAED]">{model.type}</Text>
      <Text numberOfLines={1} className="min-w-0 flex-[0.75] text-[15px] font-medium text-[#E8EAED]">
        {model.documents} {model.documents === 1 ? "dokument" : "dokumentów"}
      </Text>
      <View className="min-w-0 flex-[0.8] flex-row items-center">
        <View className={`mr-2 h-[7px] w-[7px] rounded-full ${active ? "bg-[#27d884]" : "bg-[#ff5d5d]"}`} />
        <Text numberOfLines={1} className={`text-[12px] font-black ${active ? "text-[#9fb6aa]" : "text-[#ffaaa8]"}`}>
          {statusLabel}
        </Text>
      </View>
      <View className="absolute right-4 opacity-0 group-hover:opacity-100">
        <Text className="text-[12px] font-black text-[#FF921F]">Otwórz</Text>
      </View>
    </Pressable>
  );
}

function ModelsPanel({ brands, machineModels, machineTypes }: { brands: Brand[]; machineModels: MachineModel[]; machineTypes: MachineType[] }) {
  const [search, setSearch] = useState("");
  const [selectedBrandId, setSelectedBrandId] = useState<number>();
  const [selectedTypeId, setSelectedTypeId] = useState<number>();

  const filteredModels = useMemo(() => {
    const query = search.trim().toLowerCase();
    return machineModels.filter((model) => {
      if (selectedBrandId && model.brandId !== selectedBrandId) return false;
      if (selectedTypeId && model.typeId !== selectedTypeId) return false;
      if (!query) return true;
      return [model.name, model.producer, model.type].some((value) => value.toLowerCase().includes(query));
    });
  }, [machineModels, search, selectedBrandId, selectedTypeId]);

  return (
    <View className="relative mt-7" style={{ zIndex: 40, elevation: 40 }}>
      <View className="mb-[14px] flex-row items-end justify-between">
        <View>
          <Text className="text-[24px] font-extrabold text-[#E8EAED]">Modele maszyn</Text>
          <Text className="mt-1 text-[13px] font-semibold text-[#9AA4B2]">Lista maszyn dostępnych przy przypisywaniu dokumentów.</Text>
        </View>
        <Pressable className="h-10 flex-row items-center justify-center rounded-lg bg-[#FF7A00] px-[18px] hover:bg-[#FF921F]" onPress={() => router.push("/add-machine")}>
          <Plus size={18} color="#111820" strokeWidth={2.4} />
          <Text className="ml-2 text-[12px] font-extrabold text-[#111820]">Dodaj maszynę</Text>
        </Pressable>
      </View>

      <ModelFilters
        brands={brands}
        machineTypes={machineTypes}
        search={search}
        selectedBrandId={selectedBrandId}
        selectedTypeId={selectedTypeId}
        setSearch={setSearch}
        setSelectedBrandId={setSelectedBrandId}
        setSelectedTypeId={setSelectedTypeId}
      />

      <View>
        <View className="h-[62px] flex-row items-center border-b border-[rgba(255,255,255,0.08)] px-4 pr-20">
          <View className="h-full min-w-0 flex-[1.35] flex-row items-center">
            <View className="w-[74px]" />
            <Text className="min-w-0 flex-1 text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={tableHeaderTextStyle}>Model</Text>
          </View>
          <View className="h-full min-w-0 flex-[0.72] justify-center">
            <Text className="text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={tableHeaderTextStyle}>Marka</Text>
          </View>
          <View className="h-full min-w-0 flex-1 justify-center">
            <Text className="text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={tableHeaderTextStyle}>Typ</Text>
          </View>
          <View className="h-full min-w-0 flex-[0.75] justify-center">
            <Text className="text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={tableHeaderTextStyle}>Dokumenty</Text>
          </View>
          <View className="h-full min-w-0 flex-[0.8] justify-center">
            <Text className="text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={tableHeaderTextStyle}>Status</Text>
          </View>
        </View>

        <View className="pt-2">
          {filteredModels.length === 0 ? <EmptyState label="Brak maszyn do wyświetlenia." /> : null}
          {filteredModels.map((model) => (
            <MachineModelRow key={model.id} model={model} />
          ))}
        </View>
      </View>
    </View>
  );
}

function SimpleCatalogPanel({
  activeTab,
  brands,
  machineTypes
}: {
  activeTab: Exclude<CatalogTab, "models">;
  brands: Brand[];
  machineTypes: MachineType[];
}) {
  const rows = activeTab === "brands" ? brands : machineTypes;

  return (
    <>
      <CatalogHeader activeTab={activeTab} count={rows.length} />
      <View className="mt-5 gap-[11px]">
        {rows.length === 0 ? <EmptyState label="Brak danych do wyswietlenia." /> : null}
        {rows.map((item) => (
          <CatalogRow
            key={item.id}
            item={item}
            subtitle={activeTab === "brands" ? `${item.count} modeli powiazanych` : `${item.count} modeli w tym typie`}
          />
        ))}
      </View>
    </>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <View className="min-h-[88px] justify-center rounded-md border border-[#2d3745] bg-[#1a212b] px-5">
      <Text className="text-[14px] font-black text-[#dfe7f2]">{label}</Text>
    </View>
  );
}

export function MachineCatalogScreen() {
  const params = useLocalSearchParams();
  const requestedTab = getCatalogTabParam(params.tab);
  const [activeTab, setActiveTab] = useState<CatalogTab>(requestedTab ?? "models");
  const [attachmentsSource, setAttachmentsSource] = useState<AttachmentResponse[]>([]);
  const [brandsSource, setBrandsSource] = useState<BrandResponse[]>([]);
  const [devicesSource, setDevicesSource] = useState<DeviceResponse[]>([]);
  const [deviceTypesSource, setDeviceTypesSource] = useState<DeviceTypeResponse[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    Promise.all([
      fetchAttachmentsWithDevices(),
      fetchJson<BrandResponse[]>(WEB_BRANDS_URL, BRANDS_URL, "marki"),
      fetchJson<DeviceTypeResponse[]>(WEB_DEVICE_TYPES_URL, DEVICE_TYPES_URL, "typy maszyn"),
      fetchJson<DeviceResponse[]>(WEB_DEVICES_URL, DEVICES_URL, "maszyny")
    ])
      .then(([attachmentItems, brandItems, deviceTypeItems, deviceItems]) => {
        if (!active) return;
        setAttachmentsSource(attachmentItems);
        setBrandsSource(brandItems);
        setDeviceTypesSource(deviceTypeItems);
        setDevicesSource(deviceItems);
        setError(undefined);
      })
      .catch((fetchError: unknown) => {
        if (!active) return;
        setError(fetchError instanceof Error ? fetchError.message : "Nie udalo sie pobrac katalogu maszyn.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (requestedTab) {
      setActiveTab(requestedTab);
    }
  }, [requestedTab]);

  function changeTab(tab: CatalogTab) {
    setActiveTab(tab);
    router.setParams({ tab });
  }

  const brandCounts = useMemo(() => countById(devicesSource, "brand_id"), [devicesSource]);
  const typeCounts = useMemo(() => countById(devicesSource, "device_type_id"), [devicesSource]);
  const documentCountsByDeviceId = useMemo(() => {
    const counts = new Map<number, number>();

    attachmentsSource.forEach((attachment) => {
      const deviceIds = new Set((attachment.devices ?? []).map((device) => device.id).filter(Boolean));
      deviceIds.forEach((deviceId) => counts.set(deviceId, (counts.get(deviceId) ?? 0) + 1));
    });

    return counts;
  }, [attachmentsSource]);

  const brands = useMemo(
    () =>
      brandsSource.map((brand) => ({
        ...brand,
        count: brandCounts.get(brand.id) ?? 0,
        mark: getMark(brand.name)
      })),
    [brandCounts, brandsSource]
  );

  const machineTypes = useMemo(
    () =>
      deviceTypesSource.map((type) => ({
        ...type,
        count: typeCounts.get(type.id) ?? 0,
        mark: getMark(type.name)
      })),
    [deviceTypesSource, typeCounts]
  );

  const machineModels = useMemo(() => {
    const brandsById = new Map(brandsSource.map((brand) => [brand.id, brand]));
    const typesById = new Map(deviceTypesSource.map((type) => [type.id, type.name]));

    return devicesSource.map((device) => {
      const brand = device.brand_id ? brandsById.get(device.brand_id) : undefined;
      const producer = brand?.name ?? "Brak marki";
      const documentCount = documentCountsByDeviceId.get(device.id) ?? 0;

      return {
        id: device.id,
        name: device.name,
        producer,
        modelSerialCode: device.model_serial_code,
        brandId: device.brand_id,
        type: device.device_type_id ? typesById.get(device.device_type_id) ?? "Brak typu" : "Brak typu",
        typeId: device.device_type_id,
        documents: documentCount,
        status: documentCount > 0 ? "active" as const : "unassigned" as const,
        imageUrl: device.image_url,
        brandLogoUrl: brand?.logo_url,
        brandMark: getMark(producer)
      };
    });
  }, [brandsSource, devicesSource, deviceTypesSource, documentCountsByDeviceId]);

  const unassignedModelsCount = useMemo(
    () => machineModels.filter((model) => model.status === "unassigned").length,
    [machineModels]
  );

  return (
    <SafeAreaView className="flex-1 bg-[#0D141C]" edges={["top", "left", "right"]}>
      <View className="flex-1 flex-row bg-[#0D141C]" style={technicalBackgroundStyle}>
        <AdminSidebar activeSection="catalog" />

        <ScrollView className="min-w-0 flex-1" contentContainerClassName="px-[34px] pb-12 pt-[37px]">
          <CatalogPageHeader brandCount={brands.length} modelCount={machineModels.length} typeCount={machineTypes.length} />
          <CatalogStats
            brandCount={brands.length}
            modelCount={machineModels.length}
            typeCount={machineTypes.length}
            unassignedCount={unassignedModelsCount}
          />

          <Tabs activeTab={activeTab} onChange={changeTab} />

          {loading ? <EmptyState label="Ladowanie katalogu maszyn..." /> : null}
          {!loading && error ? <EmptyState label={error} /> : null}
          {!loading && !error && activeTab === "models" ? <ModelsPanel brands={brands} machineModels={machineModels} machineTypes={machineTypes} /> : null}
          {!loading && !error && activeTab === "brands" ? <BrandsPanel brands={brands} /> : null}
          {!loading && !error && activeTab === "machineTypes" ? <MachineTypesPanel machineTypes={machineTypes} /> : null}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
