import Constants from "expo-constants";
import { apiUrl } from "../config/api";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, ScrollView, Text, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdminSidebar } from "../components/AdminSidebar";
import {
  applyDeviceDictionaries,
  fetchBrands,
  fetchDeviceDocumentCounts,
  fetchDevices,
  fetchDeviceTypes,
  getSelectedLabel,
  MachineChoiceStep,
  WizardActionFooter,
  type Brand,
  type Device,
  type DeviceType
} from "./AddDocumentScreen";

const ATTACHMENTS_URL = apiUrl("api/attachments");
const WEB_ATTACHMENTS_URL = "/api/attachments";
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

type AttachmentDetails = {
  devices?: Device[];
  original_filename?: string;
};

function getStringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getApiHeaders() {
  return Platform.OS === "web" ? undefined : { Authorization: `Bearer ${AUTH_TOKEN}` };
}

async function fetchAttachmentDetails(id: string) {
  const response = await fetch(`${Platform.OS === "web" ? WEB_ATTACHMENTS_URL : ATTACHMENTS_URL}/${encodeURIComponent(id)}`, {
    headers: getApiHeaders()
  });

  if (!response.ok) {
    let detail: string | undefined;
    try {
      detail = ((await response.json()) as { detail?: string }).detail;
    } catch {}
    throw new Error(detail ?? `Nie udało się pobrać dokumentu (${response.status}).`);
  }

  return (await response.json()) as AttachmentDetails;
}

async function updateAttachmentDevice(id: string, deviceId: number, method: "DELETE" | "POST") {
  const response = await fetch(
    `${Platform.OS === "web" ? WEB_ATTACHMENTS_URL : ATTACHMENTS_URL}/${encodeURIComponent(id)}/devices/${encodeURIComponent(String(deviceId))}`,
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

async function saveAttachmentDevices(id: string, initialDeviceIds: number[], selectedDeviceIds: number[]) {
  const initialIds = new Set(initialDeviceIds);
  const selectedIds = new Set(selectedDeviceIds);
  const idsToLink = selectedDeviceIds.filter((deviceId) => !initialIds.has(deviceId));
  const idsToUnlink = initialDeviceIds.filter((deviceId) => !selectedIds.has(deviceId));

  for (const deviceId of idsToLink) {
    await updateAttachmentDevice(id, deviceId, "POST");
  }

  for (const deviceId of idsToUnlink) {
    await updateAttachmentDevice(id, deviceId, "DELETE");
  }
}

export function DocumentMachineAssignmentsScreen() {
  const params = useLocalSearchParams();
  const id = getStringParam(params.id);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [deviceDocumentCounts, setDeviceDocumentCounts] = useState<Map<number, number>>(new Map());
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [devicesError, setDevicesError] = useState<string>();
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [documentName, setDocumentName] = useState("Dokument");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [search, setSearch] = useState("");
  const [initialDeviceIds, setInitialDeviceIds] = useState<number[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<number>();
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<number[]>([]);
  const [selectedDeviceTypeId, setSelectedDeviceTypeId] = useState<number>();
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!id) {
      setDevicesError("Brak ID dokumentu.");
      setDevicesLoading(false);
      return;
    }

    let active = true;
    setDevicesLoading(true);

    Promise.all([
      fetchDevices(),
      fetchBrands(),
      fetchDeviceTypes(),
      fetchDeviceDocumentCounts().catch(() => new Map<number, number>()),
      fetchAttachmentDetails(id)
    ])
      .then(([deviceItems, brandItems, deviceTypeItems, documentCounts, attachment]) => {
        if (!active) return;
        setBrands(brandItems);
        setDeviceTypes(deviceTypeItems);
        setDeviceDocumentCounts(documentCounts);
        setDevices(applyDeviceDictionaries(deviceItems, brandItems, deviceTypeItems));
        const assignedDeviceIds = attachment.devices?.map((device) => device.id) ?? [];
        setInitialDeviceIds(assignedDeviceIds);
        setSelectedDeviceIds(assignedDeviceIds);
        setDocumentName(attachment.original_filename ?? "Dokument");
        setDevicesError(undefined);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setDevicesError(error instanceof Error ? error.message : "Nie udało się pobrać maszyn.");
      })
      .finally(() => {
        if (active) setDevicesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  const selectedLabel = useMemo(() => getSelectedLabel(selectedDeviceIds.length), [selectedDeviceIds.length]);

  function toggleDevice(deviceId: number) {
    setSelectedDeviceIds((current) => (current.includes(deviceId) ? current.filter((item) => item !== deviceId) : [...current, deviceId]));
  }

  function toggleVisibleDevices(ids: number[]) {
    if (ids.length === 0) return;

    setSelectedDeviceIds((current) => {
      const visibleIds = new Set(ids);
      const allVisibleSelected = ids.every((deviceId) => current.includes(deviceId));

      if (allVisibleSelected) {
        return current.filter((deviceId) => !visibleIds.has(deviceId));
      }

      return Array.from(new Set([...current, ...ids]));
    });
  }

  async function saveAssignments() {
    if (!id) return;

    setSaving(true);
    setSaveError(undefined);

    try {
      await saveAttachmentDevices(id, initialDeviceIds, selectedDeviceIds);
      router.replace(`/documents/${id}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Nie udało się zapisać powiązań.");
    } finally {
      setSaving(false);
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
              <View className="mb-7">
                <Text className="text-[32px] font-black text-[#dfe7f2]">Przypisz dokument do maszyn</Text>
                <Text numberOfLines={1} className="mt-3 text-[18px] font-semibold text-[#E8EAED]">{documentName}</Text>
                <Text className="mt-2 text-[15px] font-semibold leading-[22px] text-[#9AA4B2]">
                  Wybierz maszyny, dla których ten dokument ma być dostępny w asystencie.
                </Text>
              </View>

              <MachineChoiceStep
                brands={brands}
                deviceDocumentCounts={deviceDocumentCounts}
                devices={devices}
                deviceTypes={deviceTypes}
                devicesError={devicesError}
                devicesLoading={devicesLoading}
                onBack={() => router.replace(`/documents/${id ?? ""}`)}
                onNext={saveAssignments}
                search={search}
                selectedBrandId={selectedBrandId}
                selectedDeviceIds={selectedDeviceIds}
                selectedDeviceTypeId={selectedDeviceTypeId}
                setSelectedBrandId={setSelectedBrandId}
                setSelectedDeviceTypeId={setSelectedDeviceTypeId}
                setSearch={setSearch}
                showHeader={false}
                toggleDevice={toggleDevice}
                toggleVisibleDevices={toggleVisibleDevices}
              />

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
            onSecondary={() => router.replace(`/documents/${id ?? ""}`)}
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
