import Constants from "expo-constants";
import { apiUrl } from "../config/api";
import { router, useLocalSearchParams } from "expo-router";
import { createElement, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Edit3, Hammer, Layers3, Save, Trash2, XCircle } from "lucide-react-native";
import { Image, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdminSidebar } from "../components/AdminSidebar";

type DeviceType = {
  id: number;
  name: string;
};

type Brand = {
  id: number;
  logo_url?: string;
  name: string;
};

type Device = {
  brand_id?: number;
  device_type_id?: number;
  id: number;
  image_url?: string;
  model_serial_code?: string;
  name: string;
};

const BRANDS_URL = apiUrl("api/brands");
const DEVICE_TYPES_URL = apiUrl("api/device_types");
const DEVICES_URL = apiUrl("api/devices");
const WEB_BRANDS_URL = "/api/brands";
const WEB_DEVICE_TYPES_URL = "/api/device_types";
const WEB_DEVICES_URL = "/api/devices";
const DELETE_CONFIRMATION_PHRASE = "tak, usuń";
const AUTH_TOKEN =
  ((Constants.expoConfig?.extra as { authToken?: string } | undefined)?.authToken) ??
  process.env.AUTH_TOKEN ??
  process.env.EXPO_PUBLIC_AUTH_TOKEN ??
  "";

function getStringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getApiHeaders() {
  return Platform.OS === "web" ? undefined : { Authorization: `Bearer ${AUTH_TOKEN}` };
}

function getDeviceTypeDetailsUrl(id: string) {
  return Platform.OS === "web" ? `/api/device_types/${encodeURIComponent(id)}` : `${DEVICE_TYPES_URL}/${encodeURIComponent(id)}`;
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

async function fetchDeviceType(id: string) {
  if (Platform.OS === "web") {
    return fetchJson<DeviceType>(`/api/device_types/${encodeURIComponent(id)}`, `${DEVICE_TYPES_URL}/${encodeURIComponent(id)}`, "typ maszyny");
  }

  const deviceTypes = await fetchJson<DeviceType[]>(WEB_DEVICE_TYPES_URL, DEVICE_TYPES_URL, "typy maszyn");
  const deviceType = deviceTypes.find((item) => String(item.id) === id);

  if (!deviceType) {
    throw new Error(`Nie znaleziono typu maszyny o ID ${id}.`);
  }

  return deviceType;
}

async function updateDeviceType(id: string, payload: Pick<DeviceType, "name">) {
  const body = JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json",
    ...(getApiHeaders() ?? {})
  };
  let response = await fetch(getDeviceTypeDetailsUrl(id), {
    body,
    headers,
    method: "PATCH"
  });

  if (response.status === 405 || response.status === 501) {
    response = await fetch(getDeviceTypeDetailsUrl(id), {
      body,
      headers,
      method: "PUT"
    });
  }

  if (!response.ok) {
    let detail: string | undefined;
    try {
      detail = ((await response.clone().json()) as { detail?: string }).detail;
    } catch {
      detail = await response.text().catch(() => undefined);
    }
    throw new Error(detail ?? `Nie udało się zapisać typu maszyny (${response.status}).`);
  }

  return (await response.json().catch(() => payload)) as DeviceType;
}

async function deleteDeviceType(id: string) {
  const response = await fetch(getDeviceTypeDetailsUrl(id), {
    method: "DELETE",
    headers: getApiHeaders()
  });

  if (!response.ok) {
    let detail: string | undefined;
    try {
      detail = ((await response.clone().json()) as { detail?: string }).detail;
    } catch {
      detail = await response.text().catch(() => undefined);
    }
    throw new Error(detail ?? `Nie udało się usunąć typu maszyny (${response.status}).`);
  }
}

function getMachineCountLabel(count: number) {
  if (count === 1) return "1 powiązana maszyna";
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  const suffix = lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14) ? "powiązane maszyny" : "powiązanych maszyn";
  return `${count} ${suffix}`;
}

function TypeEditCard({
  hasUnsavedChanges,
  name,
  onCancel,
  onNameChange,
  onSave,
  saving,
  saveError,
  savedMessage
}: {
  hasUnsavedChanges: boolean;
  name: string;
  onCancel: () => void;
  onNameChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
  saveError?: string;
  savedMessage?: string;
}) {
  const actionsDisabled = saving || !hasUnsavedChanges;
  const headerStatus = hasUnsavedChanges ? "Niezapisane zmiany" : savedMessage ? "Zapisano" : undefined;

  return (
    <View className="rounded-lg border border-[#2d3745] bg-[#1a212b]">
      <View className="px-7 pb-4 pt-6">
        <View className="mb-4 flex-row items-center justify-between gap-4">
          <View className="min-w-0 flex-1 flex-row items-center">
            <Edit3 size={19} color="#ffb36f" />
            <Text className="ml-3 min-w-0 flex-1 text-[18px] font-medium text-[#dfe6ef]">Edycja typu</Text>
          </View>
          {headerStatus ? (
            <Text className={`shrink-0 text-[12px] font-black ${hasUnsavedChanges ? "text-[#ffb36f]" : "text-[#20e288]"}`}>
              {headerStatus}
            </Text>
          ) : null}
        </View>

        <View>
          <Text className="mb-2 text-[12px] font-black uppercase tracking-[0.5px] text-[#c3cad5]">Nazwa typu</Text>
          <TextInput
            className="h-[46px] rounded-md border border-[#303b49] bg-[#101820] px-3 text-[15px] font-semibold text-[#dfe6ef] outline-none"
            onChangeText={onNameChange}
            placeholder="Nazwa typu"
            placeholderTextColor="#6F7A88"
            value={name}
          />
        </View>

        {saveError ? (
          <View className="mt-4 rounded-md border border-[#965a12] bg-[#2a1d13] px-4 py-3">
            <Text className="text-[13px] font-black text-[#ffb36f]">{saveError}</Text>
          </View>
        ) : null}
      </View>

      <View className="mx-7 mb-6 mt-4 flex-row items-center justify-end border-t border-[#26313c] pt-5">
        <View className="flex-row justify-end gap-3">
          <Pressable
            className={`h-11 flex-row items-center justify-center rounded-md border border-[#2d3745] px-5 ${actionsDisabled ? "opacity-45" : "hover:bg-[#222b36]"}`}
            disabled={actionsDisabled}
            onPress={onCancel}
          >
            <XCircle size={15} color={actionsDisabled ? "#7d8794" : "#dbe3ee"} />
            <Text className={`ml-2 text-[13px] font-black ${actionsDisabled ? "text-[#7d8794]" : "text-[#dbe3ee]"}`}>Anuluj</Text>
          </Pressable>
          <Pressable
            className={`h-11 flex-row items-center justify-center rounded-md border px-5 ${actionsDisabled ? "border-[#343c46] bg-[#2a2f36] opacity-45" : "border-[#ff8a00] bg-[#ff8a00] hover:bg-[#FF921F]"}`}
            disabled={actionsDisabled}
            onPress={onSave}
          >
            <Save size={15} color={actionsDisabled ? "#7d8794" : "#111820"} />
            <Text className={`ml-2 text-[13px] font-black ${actionsDisabled ? "text-[#7d8794]" : "text-[#111820]"}`}>{saving ? "Zapisywanie..." : "Zapisz zmiany"}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function TypeInfoCard({ deviceType, devices }: { deviceType: DeviceType; devices: Device[] }) {
  return (
    <View className="rounded-lg border border-[#2d3745] bg-[#1a212b] px-5 py-5">
      <Text className="mb-4 text-[18px] font-medium text-[#dfe6ef]">Informacje o typie</Text>
      <InfoItem label="Nazwa" value={deviceType.name} />
      <InfoItem label="Powiązania" value={getMachineCountLabel(devices.length)} last />
    </View>
  );
}

function InfoItem({ label, last, value }: { label: string; last?: boolean; value: string }) {
  return (
    <View className={last ? "" : "mb-4"}>
      <Text className="text-[11px] font-black tracking-[0.4px] text-[#c3cad5]">{label}</Text>
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

function RelatedMachinesCard({ brandsById, devices }: { brandsById: Map<number, Brand>; devices: Device[] }) {
  return (
    <View className="rounded-lg border border-[#2d3745] bg-[#1a212b] px-5 py-5">
      <Text className="mb-4 text-[18px] font-medium text-[#dfe6ef]">Powiązane maszyny</Text>

      <View className="gap-[10px]">
        {devices.length === 0 ? (
          <View className="min-h-[54px] flex-row items-center rounded-md border border-[#2d3745] bg-[#171e27] px-3 py-2">
            <Hammer size={19} color="#cfd6e0" />
            <Text className="ml-3 flex-1 text-[14px] font-medium text-[#dfe6ef]">Brak maszyn powiązanych z tym typem.</Text>
          </View>
        ) : null}

        {devices.map((device) => (
          <RelatedMachineRow key={device.id} brandLogoUrl={device.brand_id ? brandsById.get(device.brand_id)?.logo_url : undefined} device={device} />
        ))}
      </View>
    </View>
  );
}

function RelatedMachineRow({ brandLogoUrl, device }: { brandLogoUrl?: string; device: Device }) {
  return (
    <Pressable
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
        {brandLogoUrl ? (
          <View className="mr-3 shrink-0 items-start justify-center">
            <RelatedMachineBrandLogo uri={brandLogoUrl} />
          </View>
        ) : null}
        <Text numberOfLines={1} className="min-w-0 flex-1 text-[14px] font-semibold text-[#dfe6ef]">{device.name}</Text>
      </View>
    </Pressable>
  );
}

function DangerActionsCard({ onDeletePress }: { onDeletePress: () => void }) {
  return (
    <View className="rounded-lg border border-[#4a2d31] bg-[#1a212b] px-5 py-5">
      <Text className="text-[18px] font-medium text-[#f4c3c0]">Strefa niebezpieczna</Text>
      <Text className="mt-1 text-[12px] font-medium leading-[17px] text-[#c9aaa5]">Trwałe działania dotyczące typu.</Text>

      <Pressable className="mt-4 h-[45px] flex-row items-center justify-center rounded-md border border-[#f09a91] bg-transparent hover:bg-[#2a1d22]" onPress={onDeletePress}>
        <Trash2 size={15} color="#f09a91" />
        <Text className="ml-3 text-[12px] font-black text-[#f09a91]">Usuń typ</Text>
      </Pressable>

      <View className="mt-3 flex-row items-start">
        <AlertTriangle size={14} color="#d7c9b4" />
        <Text className="ml-2 flex-1 text-[11px] font-medium leading-[15px] text-[#d7c9b4]">
          Po usunięciu typ zniknie z katalogu maszyn.
        </Text>
      </View>
    </View>
  );
}

function DeleteMachineTypeConfirmationModal({
  deleteError,
  deleting,
  onCancel,
  onConfirm,
  onPhraseChange,
  phrase,
  typeName,
  visible
}: {
  deleteError?: string;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onPhraseChange: (value: string) => void;
  phrase: string;
  typeName: string;
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
              <Text className="text-[20px] font-black text-[#f4c3c0]">Usunąć typ?</Text>
              <Text className="mt-2 text-[13px] font-medium leading-[19px] text-[#c9aaa5]">
                Ta operacja jest trwała. Typ zostanie usunięty z katalogu maszyn.
              </Text>
            </View>
          </View>

          <View className="mt-5">
            <Text className="text-[12px] font-black uppercase tracking-[0.6px] text-[#d7c9b4]">Typ:</Text>
            <Text numberOfLines={2} className="mt-2 text-[15px] font-semibold leading-[20px] text-[#dfe6ef]">{typeName}</Text>
          </View>

          <View className="mt-5">
            <Text className="text-[12px] font-black uppercase tracking-[0.6px] text-[#d7c9b4]">Wpisz frazę, aby potwierdzić:</Text>
            <Text className="mt-2 text-[14px] font-black text-[#f09a91]" selectable={false}>{DELETE_CONFIRMATION_PHRASE}</Text>
            <TextInput
              autoCorrect={false}
              className="mt-3 h-11 rounded-md border border-[#4a2d31] bg-[#0f161d] px-3 text-[15px] font-bold text-[#f4c3c0] outline-none"
              contextMenuHidden
              onChangeText={onPhraseChange}
              value={phrase}
            />
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
            <Pressable className={`h-11 flex-row items-center justify-center rounded-md px-5 ${canConfirm ? "bg-[#f09a91]" : "bg-[#4a2d31] opacity-45"}`} disabled={!canConfirm} onPress={onConfirm}>
              <Trash2 size={15} color="#111820" />
              <Text className="ml-2 text-[13px] font-black text-[#111820]">{deleting ? "Usuwanie..." : "Usuń typ"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function MachineTypeDetailsScreen() {
  const params = useLocalSearchParams();
  const id = getStringParam(params.id);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [deleteError, setDeleteError] = useState<string>();
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deletePromptVisible, setDeletePromptVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deviceType, setDeviceType] = useState<DeviceType>();
  const [devices, setDevices] = useState<Device[]>([]);
  const [draftName, setDraftName] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string>();
  const [savedMessage, setSavedMessage] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    if (!id) {
      setError("Brak ID typu maszyny.");
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all([
      fetchDeviceType(id),
      fetchJson<Brand[]>(WEB_BRANDS_URL, BRANDS_URL, "marki"),
      fetchJson<Device[]>(WEB_DEVICES_URL, DEVICES_URL, "maszyny")
    ])
      .then(([deviceTypeItem, brandItems, deviceItems]) => {
        if (!active) return;
        setBrands(brandItems);
        setDeviceType(deviceTypeItem);
        setDraftName(deviceTypeItem.name);
        setDevices(deviceItems.filter((device) => String(device.device_type_id) === id));
        setError(undefined);
      })
      .catch((fetchError: unknown) => {
        if (!active) return;
        setError(fetchError instanceof Error ? fetchError.message : "Nie udało się pobrać szczegółów typu maszyny.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  function resetDraft() {
    setDraftName(deviceType?.name ?? "");
    setSaveError(undefined);
    setSavedMessage(undefined);
  }

  function changeDraftName(value: string) {
    setDraftName(value);
    setSaveError(undefined);
    setSavedMessage(undefined);
  }

  async function saveDeviceType() {
    if (!id || !deviceType) return;

    const nextName = draftName.trim();

    if (!nextName) {
      setSaveError("Nazwa typu nie może być pusta.");
      setSavedMessage(undefined);
      return;
    }

    setSaving(true);
    setSaveError(undefined);
    setSavedMessage(undefined);

    try {
      const updated = await updateDeviceType(id, {
        name: nextName
      });
      const nextDeviceType = {
        ...deviceType,
        ...updated,
        name: updated.name ?? nextName
      };
      setDeviceType(nextDeviceType);
      setDraftName(nextDeviceType.name);
      setSavedMessage("Zapisano zmiany typu.");
    } catch (saveFailure) {
      setSaveError(saveFailure instanceof Error ? saveFailure.message : "Nie udało się zapisać typu maszyny.");
    } finally {
      setSaving(false);
    }
  }

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

  async function confirmDeleteMachineType() {
    if (!id || deletePhrase.trim() !== DELETE_CONFIRMATION_PHRASE) return;

    setDeleting(true);
    setDeleteError(undefined);

    try {
      await deleteDeviceType(id);
      router.replace("/catalog?tab=machineTypes");
    } catch (deleteFailure) {
      setDeleteError(deleteFailure instanceof Error ? deleteFailure.message : "Nie udało się usunąć typu maszyny.");
    } finally {
      setDeleting(false);
    }
  }

  const hasUnsavedChanges = deviceType ? draftName !== deviceType.name : false;
  const brandsById = useMemo(() => new Map(brands.map((brand) => [brand.id, brand])), [brands]);

  return (
    <SafeAreaView className="flex-1 bg-[#0f161d]" edges={["top", "left", "right"]}>
      <View className="flex-1 flex-row bg-[#0f161d]">
        <AdminSidebar activeSection="catalog" />

        <ScrollView className="min-w-0 flex-1" contentContainerClassName="px-[34px] pb-12 pt-[29px]">
          <View className="w-full max-w-[1280px] self-center">
            <Pressable className="mb-5 h-9 self-start flex-row items-center justify-center rounded-lg border border-[rgba(148,163,184,0.18)] bg-transparent px-3 hover:border-[rgba(255,122,0,0.35)] hover:bg-[rgba(255,255,255,0.04)]" onPress={() => router.replace("/catalog?tab=machineTypes")}>
              <ArrowLeft size={17} color="#AAB4C0" strokeWidth={2.5} />
              <Text className="ml-2 text-[13px] font-bold text-[#AAB4C0]">Wróć do katalogu</Text>
            </Pressable>

            <Text numberOfLines={1} className="mb-[31px] text-[28px] font-black leading-[38px] text-[#dfe7f2]">Szczegóły typu maszyny</Text>

            {loading ? (
              <View className="min-h-[260px] justify-center rounded-lg border border-[#2d3745] bg-[#1a212b] px-7">
                <Text className="text-[16px] font-black text-[#e5edf8]">Ładowanie szczegółów typu maszyny...</Text>
              </View>
            ) : null}

            {!loading && error ? (
              <View className="min-h-[260px] justify-center rounded-lg border border-[#965a12] bg-[#1a212b] px-7">
                <Text className="text-[16px] font-black text-[#ff9300]">{error}</Text>
              </View>
            ) : null}

            {!loading && !error && deviceType ? (
              <View className="pb-5">
                <View className="mb-5 py-1">
                  <View className="flex-row items-center">
                    <Layers3 size={34} color="#ffb36f" />
                    <Text numberOfLines={2} className="ml-4 min-w-0 flex-1 text-[44px] font-black leading-[58px] text-[#e5edf8]">{deviceType.name}</Text>
                  </View>
                </View>

                <View className="flex-row items-start gap-6">
                  <View className="min-w-0 flex-1 self-start">
                    <RelatedMachinesCard brandsById={brandsById} devices={devices} />
                  </View>

                  <View className="w-[390px] shrink-0 self-start">
                    <View className="gap-6">
                      <TypeEditCard
                        hasUnsavedChanges={hasUnsavedChanges}
                        name={draftName}
                        onCancel={resetDraft}
                        onNameChange={changeDraftName}
                        onSave={saveDeviceType}
                        saving={saving}
                        saveError={saveError}
                        savedMessage={savedMessage}
                      />
                      <TypeInfoCard deviceType={deviceType} devices={devices} />
                      <DangerActionsCard onDeletePress={openDeletePrompt} />
                    </View>
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>
      <DeleteMachineTypeConfirmationModal
        deleteError={deleteError}
        deleting={deleting}
        onCancel={closeDeletePrompt}
        onConfirm={confirmDeleteMachineType}
        onPhraseChange={setDeletePhrase}
        phrase={deletePhrase}
        typeName={deviceType?.name ?? "Typ maszyny"}
        visible={deletePromptVisible}
      />
    </SafeAreaView>
  );
}
