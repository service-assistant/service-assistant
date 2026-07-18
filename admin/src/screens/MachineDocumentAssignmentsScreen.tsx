import Constants from "expo-constants";
import { apiUrl } from "../config/api";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, FileCog, Search, ScrollText, ShieldAlert, Workflow, type LucideIcon } from "lucide-react-native";
import { Platform, Pressable, ScrollView, Text, TextInput, View, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdminSidebar } from "../components/AdminSidebar";
import { WizardActionFooter } from "./AddDocumentScreen";

const ATTACHMENTS_URL = apiUrl("api/attachments");
const DEVICES_URL = apiUrl("api/devices");
const WEB_ATTACHMENTS_URL = "/api/attachments";
const WEB_DEVICES_URL = "/api/devices";
const AUTH_TOKEN =
  ((Constants.expoConfig?.extra as { authToken?: string } | undefined)?.authToken) ??
  process.env.AUTH_TOKEN ??
  process.env.EXPO_PUBLIC_AUTH_TOKEN ??
  "";

type Device = {
  id: number;
  name: string;
};

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

type DocumentCategory = "Instrukcja" | "Kody błędów" | "Schemat" | "Biuletyn";

const DOCUMENT_CATEGORIES: DocumentCategory[] = ["Instrukcja", "Kody błędów", "Schemat", "Biuletyn"];
const ALL_TYPES_FILTER = "Typ: wszystkie";

const documentCategoryStyles: Record<DocumentCategory, { badge: string; color: string; icon: LucideIcon; text: string }> = {
  Instrukcja: {
    badge: "border-[#245975] bg-[#102c3a]",
    color: "#8ed7ff",
    icon: ScrollText,
    text: "text-[#a9e1ff]"
  },
  "Kody błędów": {
    badge: "border-[#6750A4] bg-[#251D3F]",
    color: "#A78BFA",
    icon: ShieldAlert,
    text: "text-[#D8CCFF]"
  },
  Schemat: {
    badge: "border-[#23634b] bg-[#122f25]",
    color: "#a7f3d0",
    icon: Workflow,
    text: "text-[#b7f7d9]"
  },
  Biuletyn: {
    badge: "border-[#544182] bg-[#241d3a]",
    color: "#d7c7ff",
    icon: FileCog,
    text: "text-[#d7c7ff]"
  }
};

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
        paddingBottom: 128,
        paddingLeft: "clamp(24px, 3vw, 48px)",
        paddingRight: "clamp(24px, 3vw, 48px)",
        paddingTop: "clamp(16px, 2.25vw, 36px)",
        width: "100%"
      } as unknown as ViewStyle)
    : undefined;

const tableHeaderTextStyle =
  Platform.OS === "web"
    ? ({
        lineHeight: 13
      } as TextStyle)
    : undefined;

function getStringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getApiHeaders() {
  return Platform.OS === "web" ? undefined : { Authorization: `Bearer ${AUTH_TOKEN}` };
}

async function fetchJson<T>(webUrl: string, nativeUrl: string, label: string) {
  const response = await fetch(Platform.OS === "web" ? webUrl : nativeUrl, {
    headers: getApiHeaders()
  });

  if (!response.ok) {
    let detail: string | undefined;
    try {
      detail = ((await response.json()) as { detail?: string }).detail;
    } catch {}
    throw new Error(detail ?? `Nie udało się pobrać danych: ${label} (${response.status}).`);
  }

  return (await response.json()) as T;
}

async function fetchDevicesForAttachment(id: number) {
  const response = await fetch(`${ATTACHMENTS_URL}/${encodeURIComponent(String(id))}/devices`, {
    headers: getApiHeaders()
  });

  if (!response.ok) return [] as AttachmentDevice[];
  return (await response.json()) as AttachmentDevice[];
}

async function fetchAttachmentsWithDevices() {
  const attachments = await fetchJson<Attachment[]>(WEB_ATTACHMENTS_URL, ATTACHMENTS_URL, "dokumenty");

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

async function updateAttachmentDevice(attachmentId: number, deviceId: string, method: "DELETE" | "POST") {
  const response = await fetch(
    `${Platform.OS === "web" ? WEB_ATTACHMENTS_URL : ATTACHMENTS_URL}/${encodeURIComponent(String(attachmentId))}/devices/${encodeURIComponent(deviceId)}`,
    {
      method,
      headers: getApiHeaders()
    }
  );

  if (!response.ok) {
    let detail: string | undefined;
    try {
      detail = ((await response.clone().json()) as { detail?: string }).detail;
    } catch {
      detail = await response.text().catch(() => undefined);
    }
    throw new Error(detail ?? `Nie udało się zapisać powiązań (${response.status}).`);
  }
}

async function saveMachineDocuments(deviceId: string, initialDocumentIds: number[], selectedDocumentIds: number[]) {
  const initialIds = new Set(initialDocumentIds);
  const selectedIds = new Set(selectedDocumentIds);
  const idsToLink = selectedDocumentIds.filter((attachmentId) => !initialIds.has(attachmentId));
  const idsToUnlink = initialDocumentIds.filter((attachmentId) => !selectedIds.has(attachmentId));

  for (const attachmentId of idsToLink) {
    await updateAttachmentDevice(attachmentId, deviceId, "POST");
  }

  for (const attachmentId of idsToUnlink) {
    await updateAttachmentDevice(attachmentId, deviceId, "DELETE");
  }
}

export function MachineDocumentAssignmentsScreen() {
  const params = useLocalSearchParams();
  const id = getStringParam(params.id);
  const [documents, setDocuments] = useState<Attachment[]>([]);
  const [documentsError, setDocumentsError] = useState<string>();
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [initialDocumentIds, setInitialDocumentIds] = useState<number[]>([]);
  const [machineName, setMachineName] = useState("Pojazd");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_TYPES_FILTER);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<number[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!id) {
      setDocumentsError("Brak ID pojazdu.");
      setDocumentsLoading(false);
      return;
    }

    let active = true;
    setDocumentsLoading(true);

    Promise.all([
      fetchJson<Device[]>(WEB_DEVICES_URL, DEVICES_URL, "maszyny"),
      fetchAttachmentsWithDevices()
    ])
      .then(([deviceItems, attachmentItems]) => {
        if (!active) return;
        const machineId = Number(id);
        const device = deviceItems.find((item) => item.id === machineId);
        const assignedDocumentIds = attachmentItems
          .filter((attachment) => attachment.devices?.some((item) => item.id === machineId))
          .map((attachment) => attachment.id);

        setMachineName(device?.name ?? "Pojazd");
        setDocuments(attachmentItems);
        setInitialDocumentIds(assignedDocumentIds);
        setSelectedDocumentIds(assignedDocumentIds);
        setDocumentsError(undefined);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setDocumentsError(error instanceof Error ? error.message : "Nie udało się pobrać dokumentów.");
      })
      .finally(() => {
        if (active) setDocumentsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  const filteredDocuments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return documents.filter((document) => {
      const category = getDocumentCategory(document.original_filename);
      if (selectedCategory !== ALL_TYPES_FILTER && category !== selectedCategory) return false;
      if (!query) return true;
      return [document.original_filename, category].some((value) => value.toLowerCase().includes(query));
    });
  }, [documents, search, selectedCategory]);

  const selectedLabel = useMemo(() => getSelectedDocumentsLabel(selectedDocumentIds.length), [selectedDocumentIds.length]);
  const filteredDocumentIds = useMemo(() => filteredDocuments.map((document) => document.id), [filteredDocuments]);
  const allVisibleSelected = filteredDocumentIds.length > 0 && filteredDocumentIds.every((documentId) => selectedDocumentIds.includes(documentId));
  const someVisibleSelected = filteredDocumentIds.some((documentId) => selectedDocumentIds.includes(documentId));

  function toggleDocument(documentId: number) {
    setSelectedDocumentIds((current) => (current.includes(documentId) ? current.filter((item) => item !== documentId) : [...current, documentId]));
  }

  function toggleVisibleDocuments() {
    if (filteredDocumentIds.length === 0) return;

    setSelectedDocumentIds((current) => {
      const visibleIds = new Set(filteredDocumentIds);
      if (filteredDocumentIds.every((documentId) => current.includes(documentId))) {
        return current.filter((documentId) => !visibleIds.has(documentId));
      }

      return Array.from(new Set([...current, ...filteredDocumentIds]));
    });
  }

  async function saveAssignments() {
    if (!id) return;

    setSaving(true);
    setSaveError(undefined);

    try {
      await saveMachineDocuments(id, initialDocumentIds, selectedDocumentIds);
      router.replace(`/machines/${id}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Nie udało się zapisać powiązań.");
    } finally {
      setSaving(false);
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
              <View className="mb-7">
                <Text className="text-[32px] font-black text-[#dfe7f2]">Przypisz dokumenty do pojazdu</Text>
                <Text numberOfLines={1} className="mt-3 text-[18px] font-semibold text-[#E8EAED]">{machineName}</Text>
                <Text className="mt-2 text-[15px] font-semibold leading-[22px] text-[#9AA4B2]">
                  Wybierz dokumenty, które mają być dostępne dla tego pojazdu w asystencie.
                </Text>
              </View>

              <View className="relative flex-row items-center gap-3 border-b border-[rgba(255,255,255,0.08)] pb-4" style={{ zIndex: 60, elevation: 60 }}>
                <View className="h-[42px] min-w-[320px] flex-1 flex-row items-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27] px-3">
                  <Search size={17} color="#FF7A00" strokeWidth={2.4} />
                  <TextInput
                    className="ml-3 h-10 flex-1 text-[15px] font-medium text-[#E8EAED] outline-none"
                    placeholder="Szukaj po nazwie dokumentu..."
                    placeholderTextColor="#6F7A88"
                    value={search}
                    onChangeText={setSearch}
                  />
                </View>
                <DocumentTypeFilter selectedValue={selectedCategory} onSelect={setSelectedCategory} />
              </View>

              <View className="relative" style={{ zIndex: 1, elevation: 1 }}>
                <View className="h-[62px] flex-row items-center border-b border-[rgba(255,255,255,0.08)] px-4">
                  <View className="w-[48px] px-1">
                    <Pressable
                      className={`h-[18px] w-[18px] items-center justify-center rounded border ${
                        allVisibleSelected
                          ? "border-[#FF7A00] bg-[#FF7A00]"
                          : someVisibleSelected
                            ? "border-[#FF7A00] bg-[rgba(255,122,0,0.12)]"
                            : "border-[rgba(255,255,255,0.22)]"
                      }`}
                      onPress={toggleVisibleDocuments}
                    >
                      {allVisibleSelected ? <Check size={13} color="#fff" strokeWidth={4} /> : null}
                      {!allVisibleSelected && someVisibleSelected ? <View className="h-[2px] w-2 rounded bg-[#FF921F]" /> : null}
                    </Pressable>
                  </View>
                  <Text className="min-w-0 flex-1 px-3 text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={tableHeaderTextStyle}>Dokument</Text>
                  <Text className="w-[190px] px-5 text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={tableHeaderTextStyle}>Typ</Text>
                  <Text className="w-[180px] px-5 text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={tableHeaderTextStyle}>Maszyny</Text>
                  <Text className="w-[200px] px-5 text-[13px] font-black uppercase tracking-[1.1px] text-[#9AA4B2]" style={tableHeaderTextStyle}>Data dodania</Text>
                </View>

                <View className="pt-2">
                  {documentsLoading ? <DocumentChoiceEmpty label="Ładowanie dokumentów..." /> : null}
                  {!documentsLoading && documentsError ? <DocumentChoiceEmpty label={documentsError} tone="error" /> : null}
                  {!documentsLoading && !documentsError && filteredDocuments.length === 0 ? <DocumentChoiceEmpty label="Brak dokumentów do wyświetlenia." /> : null}
                  {!documentsLoading && !documentsError
                    ? filteredDocuments.map((document) => (
                        <DocumentChoiceRow
                          key={document.id}
                          document={document}
                          selected={selectedDocumentIds.includes(document.id)}
                          onToggle={() => toggleDocument(document.id)}
                        />
                      ))
                    : null}
                </View>
              </View>

              {saveError ? (
                <View className="mb-28 rounded-md border border-[#965a12] bg-[#1a212b] px-5 py-4">
                  <Text className="text-[14px] font-black text-[#ff9300]">{saveError}</Text>
                </View>
              ) : null}
            </View>
          </ScrollView>

          <WizardActionFooter
            disabled={saving || !id}
            onPrimary={saveAssignments}
            onSecondary={() => router.replace(`/machines/${id ?? ""}`)}
            primaryLabel={saving ? "Zapisywanie..." : "Zapisz zmiany"}
            secondaryLabel="Anuluj"
            trailing={(
              <Text className="text-[16px] font-medium text-[#9AA4B2]">
                Wybrano: <Text className="font-black text-[#FF921F]">{selectedLabel}</Text>
              </Text>
            )}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function DocumentChoiceEmpty({ label, tone }: { label: string; tone?: "error" }) {
  return (
    <View className={`h-[86px] justify-center border-b px-[25px] ${tone === "error" ? "border-b-[#FF7A00]" : "border-b-[rgba(255,255,255,0.08)]"}`}>
      <Text className={`text-[15px] font-semibold ${tone === "error" ? "text-[#FF921F]" : "text-[#E8EAED]"}`}>{label}</Text>
    </View>
  );
}

function DocumentTypeFilter({ onSelect, selectedValue }: { onSelect: (value: string) => void; selectedValue: string }) {
  const [open, setOpen] = useState(false);
  const options = [ALL_TYPES_FILTER, ...DOCUMENT_CATEGORIES];

  return (
    <View className="relative w-[180px]" style={{ zIndex: open ? 1000 : 10, elevation: open ? 1000 : 10 }}>
      <Pressable
        className={`h-[42px] flex-row items-center justify-between rounded-md border bg-[#151D27] px-3 ${open ? "border-[#FF7A00]" : "border-[rgba(255,255,255,0.08)]"}`}
        onPress={() => setOpen((current) => !current)}
      >
        <Text numberOfLines={1} className="min-w-0 flex-1 text-[15px] font-semibold text-[#e8eef7]">
          {selectedValue}
        </Text>
        <ChevronDown size={18} color={open ? "#FF921F" : "#6F7A88"} strokeWidth={2.4} />
      </Pressable>

      {open ? (
        <View
          className="absolute left-0 right-0 top-[48px] overflow-hidden rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27]"
          style={{ zIndex: 1100, elevation: 1100, boxShadow: "0 16px 28px rgba(0, 0, 0, 0.36)" }}
        >
          {options.map((option) => {
            const active = option === selectedValue;

            return (
              <Pressable
                key={option}
                className={`min-h-[42px] justify-center border-b border-[rgba(255,255,255,0.08)] px-4 ${active ? "bg-[rgba(255,122,0,0.12)]" : "bg-[#151D27]"}`}
                onPress={() => {
                  onSelect(option);
                  setOpen(false);
                }}
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

function DocumentChoiceRow({ document, onToggle, selected }: { document: Attachment; onToggle: () => void; selected: boolean }) {
  const category = getDocumentCategory(document.original_filename);
  const categoryStyle = documentCategoryStyles[category];
  const Icon = categoryStyle.icon;

  return (
    <Pressable
      className={`group relative h-[88px] flex-row items-center border border-transparent border-b-[rgba(255,255,255,0.08)] px-4 ${
        selected
          ? "rounded-md bg-[rgba(255,122,0,0.06)]"
          : "bg-transparent hover:rounded-md hover:border-[rgba(255,255,255,0.08)] hover:bg-[#1B2633]"
      }`}
      onPress={onToggle}
    >
      <View className="w-[48px] items-start px-1">
        <View className={`h-[18px] w-[18px] items-center justify-center rounded border ${selected ? "border-[#FF7A00] bg-[#FF7A00]" : "border-[rgba(255,255,255,0.22)] bg-transparent"}`}>
          {selected ? <Check size={13} color="#fff" strokeWidth={4} /> : null}
        </View>
      </View>
      <View className="min-w-0 flex-1 flex-row items-center px-3">
        <View className="h-[46px] w-[46px] items-center justify-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27]">
          <Icon size={24} color={categoryStyle.color} strokeWidth={2.3} />
        </View>
        <View className="ml-[17px] min-w-0 flex-1">
          <Text numberOfLines={1} className="text-[16px] font-semibold text-[#E8EAED]">{document.original_filename}</Text>
        </View>
      </View>
      <View className="w-[190px] px-5">
        <View className={`self-start rounded border px-2 py-[3px] ${categoryStyle.badge}`}>
          <Text numberOfLines={1} className={`text-[11px] font-black ${categoryStyle.text}`}>{category}</Text>
        </View>
      </View>
      <Text numberOfLines={1} className="w-[180px] px-5 text-[14px] font-medium text-[#E8EAED]">
        {getAssignedMachinesLabel(document.devices?.length ?? 0)}
      </Text>
      <Text numberOfLines={1} className="w-[200px] px-5 text-[14px] font-medium text-[#9AA4B2]">{formatDate(document.created_at)}</Text>
    </Pressable>
  );
}
