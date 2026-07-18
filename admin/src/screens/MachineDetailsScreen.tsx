import Constants from "expo-constants";
import { apiUrl } from "../config/api";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Cpu,
  Database,
  Edit3,
  FilePlus2,
  FileText,
  FolderOpen,
  Forklift,
  Hammer,
  Info,
  Trash2,
  Wrench,
  Zap
} from "lucide-react-native";
import { Image, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdminSidebar } from "../components/AdminSidebar";

type Device = {
  id: number;
  name: string;
  model_serial_code?: string;
  image_url?: string;
  brand_id?: number;
  device_type_id?: number;
};

type Brand = {
  id: number;
  name: string;
  logo_url?: string;
};

type DeviceType = {
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
  updated_at?: string;
  devices?: AttachmentDevice[];
};

const DEVICES_URL = apiUrl("api/devices");
const BRANDS_URL = apiUrl("api/brands");
const DEVICE_TYPES_URL = apiUrl("api/device_types");
const ATTACHMENTS_URL = apiUrl("api/attachments");
const WEB_DEVICES_URL = "/api/devices";
const WEB_BRANDS_URL = "/api/brands";
const WEB_DEVICE_TYPES_URL = "/api/device_types";
const WEB_ATTACHMENTS_URL = "/api/attachments";
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

async function fetchJson<T>(webUrl: string, nativeUrl: string, label: string) {
  const response = await fetch(Platform.OS === "web" ? webUrl : nativeUrl, {
    headers: getApiHeaders()
  });

  if (!response.ok) {
    let detail: string | undefined;
    try {
      detail = ((await response.json()) as { detail?: string }).detail;
    } catch {}
    throw new Error(detail ?? `Nie udalo sie pobrac danych: ${label} (${response.status}).`);
  }

  return (await response.json()) as T;
}

function getDeviceDetailsUrl(id: number | string) {
  const encodedId = encodeURIComponent(String(id));
  return Platform.OS === "web" ? `${WEB_DEVICES_URL}/${encodedId}` : `${DEVICES_URL}/${encodedId}`;
}

async function deleteDevice(id: number | string) {
  const response = await fetch(getDeviceDetailsUrl(id), {
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

    throw new Error(detail ?? `Nie udało się usunąć pojazdu (${response.status}).`);
  }
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

function getSelectedLabel(count: number) {
  if (count === 1) return "1 plik";
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  const suffix = lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14) ? "pliki" : "plikow";
  return `${count} ${suffix}`;
}

function getDocumentUsageLabel(count: number) {
  if (count === 1) return "1 dokument";
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  const suffix = lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14) ? "dokumenty" : "dokumentow";
  return `${count} ${suffix}`;
}

function HeaderActions() {
  return (
    <View className="flex-row items-center gap-4">
      <Pressable className="h-[48px] w-[167px] flex-row items-center justify-center rounded-md border border-[#2d3745] bg-transparent">
        <Edit3 size={20} color="#dfe7f2" />
        <Text className="ml-3 text-[13px] font-black text-[#dfe7f2]">Edytuj model</Text>
      </Pressable>
      <Pressable className="h-[48px] w-[185px] flex-row items-center justify-center rounded-md border border-[#2d3745] bg-transparent" onPress={() => router.push("/add-document")}>
        <FilePlus2 size={20} color="#dfe7f2" />
        <Text className="ml-3 text-[13px] font-black text-[#dfe7f2]">Dodaj dokument</Text>
      </Pressable>
      <Pressable className="h-[48px] w-[221px] flex-row items-center justify-center rounded-md bg-[#ff8a00]">
        <Bot size={20} color="#111820" />
        <Text className="ml-3 text-[13px] font-black text-[#111820]">Sprawdz w asystencie</Text>
      </Pressable>
    </View>
  );
}

function MachineImagePreview({ brand, device }: { brand?: Brand; device: Device }) {
  return (
    <View className="min-w-0 flex-1 overflow-hidden rounded-lg border border-[#2d3745] bg-[#171e27]">
      <View className="h-[56px] flex-row items-center border-b border-[#2d3745] px-5">
        <Wrench size={18} color="#ffb36f" />
        <Text className="ml-3 min-w-0 flex-1 text-[16px] font-semibold text-[#dfe6ef]">Obraz pojazdu</Text>
      </View>

      <View className="min-h-0 flex-1 items-center justify-center bg-[#101820] p-5">
        <View className="h-full w-full items-center justify-center overflow-hidden rounded-md border border-[#2d3745] bg-[#0c1219]">
          {device.image_url ? (
            <Image source={{ uri: device.image_url }} className="h-full w-full" resizeMode="contain" />
          ) : (
            <View className="items-center">
              <Forklift size={58} color="#ffd1a4" />
              <Text className="mt-4 text-[14px] font-semibold text-[#9AA4B2]">Brak zdjecia pojazdu</Text>
            </View>
          )}
        </View>
      </View>

      <View className="flex-row items-center border-t border-[#2d3745] px-5 py-4">
        {brand?.logo_url ? (
          <View className="mr-2 h-[26px] shrink-0 items-start justify-center">
            <Image source={{ uri: brand.logo_url }} className="h-[20px] w-[112px]" resizeMode="contain" />
          </View>
        ) : (
          <Text numberOfLines={1} className="mr-2 shrink-0 text-[13px] font-black uppercase text-[#ffb36f]">{brand?.name ?? "Brak marki"}</Text>
        )}
        <Text numberOfLines={1} className="min-w-0 flex-1 text-[20px] font-black text-[#e5edf8]">{device.name}</Text>
        <Text numberOfLines={1} className="hidden mt-1 text-[13px] font-medium text-[#9AA4B2]">
          {brand?.name ?? "Brak marki"} · ID {device.id}
        </Text>
      </View>
    </View>
  );
}

function MachineStatusCard({ documents }: { documents: Attachment[] }) {
  const ready = documents.length > 0;

  return (
    <View className={`min-h-[100px] flex-row items-center rounded-lg border px-5 py-4 ${ready ? "border-[#0c7655] bg-[#0b332b]" : "border-[#7a2f35] bg-[#301b21]"}`}>
      <View className={`mr-4 h-9 w-9 items-center justify-center rounded-full ${ready ? "bg-[#104b3b]" : "bg-[#4a2228]"}`}>
        {ready ? (
          <CheckCircle2 size={20} color="#20e288" fill="#20e288" strokeWidth={2.4} />
        ) : (
          <AlertTriangle size={20} color="#ffaaa8" strokeWidth={2.4} />
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text className={`text-[12px] font-black uppercase tracking-[0.7px] ${ready ? "text-[#20e288]" : "text-[#ffaaa8]"}`}>
          {ready ? "Status: Dokumentacja gotowa" : "Status: Wymaga dokumentów"}
        </Text>
        <Text className={`mt-1 text-[12px] font-medium leading-[17px] ${ready ? "text-[#c5d4d1]" : "text-[#e0b8b8]"}`}>
          {ready
            ? "Pojazd ma powiązane dokumenty i może być używany w bazie wiedzy."
            : "Do tego pojazdu nie przypisano jeszcze żadnych dokumentów."}
        </Text>
      </View>
    </View>
  );
}

function MachineInfoCard({ brand, device, deviceType, documents }: { brand?: Brand; device: Device; deviceType?: DeviceType; documents: Attachment[] }) {
  return (
    <View className="rounded-lg border border-[#2d3745] bg-[#1a212b] px-5 py-5">
      <Text className="mb-4 text-[18px] font-medium text-[#dfe6ef]">Informacje o pojeździe</Text>

      <MachineInfoItem label="Model" value={device.name} />
      <MachineInfoItem label="Numer modelu" value={device.model_serial_code ?? "Brak danych"} />
      <MachineInfoItem label="Marka" value={brand?.name ?? "Brak marki"} />
      <MachineInfoItem label="Typ" value={deviceType?.name ?? "Brak typu"} />
      <MachineInfoItem label="Używa dokumentów" value={getDocumentUsageLabel(documents.length)} />
    </View>
  );
}

function MachineInfoItem({ label, last, value }: { label: string; last?: boolean; value: string }) {
  return (
    <View className={last ? "" : "mb-4"}>
      <Text className="text-[11px] font-black tracking-[0.4px] text-[#c3cad5]">{label}</Text>
      <Text numberOfLines={2} className="mt-1 text-[14px] font-medium leading-[19px] text-[#dfe6ef]">{value}</Text>
    </View>
  );
}

function RelatedDocumentsCard({ deviceId, documents }: { deviceId: number; documents: Attachment[] }) {
  return (
    <View className="rounded-lg border border-[#2d3745] bg-[#1a212b] px-5 py-5">
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="text-[18px] font-medium text-[#dfe6ef]">Powiązane dokumenty</Text>
        <Pressable className="h-8 justify-center rounded-md px-2 hover:bg-[#222b36]" onPress={() => router.push(`/machines/${deviceId}/documents`)}>
          <Text className="text-[12px] font-black text-[#ffb36f]">Zmień</Text>
        </Pressable>
      </View>

      <View className="gap-[10px]">
        {documents.length === 0 ? (
          <View className="min-h-[54px] flex-row items-center rounded-md border border-[#2d3745] bg-[#171e27] px-3 py-2">
            <FileText size={19} color="#cfd6e0" />
            <Text className="ml-3 flex-1 text-[14px] font-medium text-[#dfe6ef]">Brak powiązanych dokumentów</Text>
          </View>
        ) : null}

        {documents.map((document) => (
          <Pressable
            key={document.id}
            className="min-h-[66px] flex-row items-center rounded-md border border-[#2d3745] bg-[#171e27] px-3 py-2 hover:bg-[#222b36]"
            onPress={() => router.push(`/documents/${document.id}`)}
          >
            <View className="h-[42px] w-[42px] items-center justify-center rounded border border-[#303b49] bg-[#101820]">
              <FileText size={20} color="#ff8374" />
            </View>
            <View className="ml-3 min-w-0 flex-1">
              <Text numberOfLines={1} className="text-[14px] font-semibold text-[#dfe6ef]">{document.original_filename}</Text>
              <Text numberOfLines={1} className="mt-1 text-[12px] font-medium text-[#9AA4B2]">Dodano: {formatDate(document.created_at)}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Hero({ brand, device, deviceType }: { brand?: Brand; device: Device; deviceType?: DeviceType }) {
  return (
    <View>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View className="h-[36px] flex-row items-center rounded-full border border-[#19734e] bg-[#0e3b2e] px-4">
            <CheckCircle2 size={14} color="#1fe084" />
            <Text className="ml-2 text-[12px] font-black text-[#1fe084]">Dokumentacja gotowa</Text>
          </View>
          <View className="ml-3 h-[50px] w-[58px] items-center justify-center rounded-full bg-[#262b34]">
            <Text className="text-center text-[12px] font-black leading-[14px] text-[#ffd1a4]">ID:{"\n"}{device.id}</Text>
          </View>
        </View>

        <HeaderActions />
      </View>

      <View className="mt-4 flex-row items-center">
        <View className="h-[94px] w-[94px] items-center justify-center overflow-hidden rounded-lg border border-[#2d3745] bg-[#111820]">
          {device.image_url ? <Image source={{ uri: device.image_url }} className="h-full w-full" resizeMode="cover" /> : <Forklift size={38} color="#ffd1a4" />}
        </View>

        <View className="ml-6 min-w-0 flex-1">
          <Text numberOfLines={2} className="text-[50px] font-black leading-[55px] text-[#e5edf8]">{device.name}</Text>
          <View className="mt-4 flex-row items-center">
            <View className="h-[38px] w-[76px] items-center justify-center overflow-hidden">
              {brand?.logo_url ? <Image source={{ uri: brand.logo_url }} className="h-full w-full" resizeMode="contain" /> : <Hammer size={22} color="#ffd1a4" />}
            </View>
            <Text numberOfLines={2} className="ml-5 max-w-[520px] text-[16px] font-black leading-[23px] text-[#ffd1a4]">
              Producent: {brand?.name ?? "Brak marki"} <Text className="text-[#7b828d]">-</Text> Typ: {deviceType?.name ?? "Brak typu"}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function TechnicalInfoCard({ brand, device, deviceType }: { brand?: Brand; device: Device; deviceType?: DeviceType }) {
  return (
    <View className="rounded-lg border border-[#2d3745] bg-[#1a212b] px-7 py-7">
      <View className="mb-7 flex-row items-center">
        <Info size={22} color="#ffb36f" />
        <Text className="ml-3 text-[26px] font-black text-[#dfe7f2]">Informacje techniczne</Text>
      </View>

      <View className="flex-row">
        <TechItem label="Model" value={device.name} />
        <TechItem label="Kod modelu / serial" value={device.model_serial_code ?? "Brak danych"} />
        <TechItem label="ID maszyny" value={String(device.id)} />
      </View>
      <View className="mt-7 flex-row">
        <TechItem icon label="Marka" value={brand?.name ?? "Brak marki"} />
        <TechItem label="Typ urzadzenia" value={deviceType?.name ?? "Brak typu"} />
        <TechItem label="Status" value="Aktywna" />
      </View>
    </View>
  );
}

function TechItem({ label, value, icon }: { label: string; value: string; icon?: boolean }) {
  return (
    <View className="min-w-0 flex-1 pr-4">
      <Text className="text-[12px] font-black uppercase tracking-[0.6px] text-[#ffd1a4]">{label}</Text>
      <View className="mt-2 flex-row items-center">
        {icon ? <Zap size={16} color="#ffb36f" /> : null}
        <Text numberOfLines={2} className={`${icon ? "ml-1" : ""} text-[18px] font-medium text-[#e5edf8]`}>{value}</Text>
      </View>
    </View>
  );
}

function ReadinessCard({ documents }: { documents: Attachment[] }) {
  return (
    <View className="rounded-lg border border-[#2d3745] bg-[#1a212b] px-6 py-7">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          <Cpu size={22} color="#ff9300" />
          <Text className="ml-3 text-[26px] font-black text-[#dfe7f2]">Gotowosc</Text>
        </View>
        <Database size={26} color="#33404c" />
      </View>

      <View className="mt-8 flex-row items-end">
        <Text className="text-[50px] font-black leading-[55px] text-[#e5edf8]">{documents.length}</Text>
        <Text className="mb-2 ml-3 text-[14px] font-black text-[#ffd1a4]">plikow w bazie</Text>
      </View>

      <ReadinessBar label="Przetworzone (gotowe)" value={String(documents.length)} color="#29d782" ratio={documents.length > 0 ? 1 : 0} />
      <ReadinessBar label="W indeksowaniu" value="0" color="#ff9300" ratio={0} />
    </View>
  );
}

function ReadinessBar({ label, value, color, ratio }: { label: string; value: string; color: string; ratio: number }) {
  return (
    <View className="mt-5">
      <View className="flex-row items-center">
        <View className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <Text className="ml-2 flex-1 text-[14px] font-black text-[#e5edf8]">{label}</Text>
        <Text className="text-[14px] font-black text-[#e5edf8]">{value}</Text>
      </View>
      <View className="mt-3 h-[5px] overflow-hidden rounded-full bg-[#0b1117]">
        <View className="h-full rounded-full" style={{ backgroundColor: color, width: `${Math.round(ratio * 100)}%` }} />
      </View>
    </View>
  );
}

function DocumentationCard({ documents }: { documents: Attachment[] }) {
  return (
    <View className="overflow-hidden rounded-lg border border-[#2d3745] bg-[#1a212b]">
      <View className="h-[79px] flex-row items-center border-b border-[#2d3745] px-7">
        <FolderOpen size={24} color="#ffb36f" />
        <Text className="ml-3 text-[26px] font-black text-[#dfe7f2]">Dokumentacja</Text>
        <Text className="ml-auto text-[13px] font-black text-[#ffb36f]">{getSelectedLabel(documents.length)}</Text>
      </View>

      {documents.length === 0 ? (
        <View className="min-h-[96px] flex-row items-center px-7">
          <AlertTriangle size={20} color="#ffd1a4" />
          <Text className="ml-3 text-[14px] font-black text-[#e5edf8]">Brak plikow powiazanych z ta maszyna.</Text>
        </View>
      ) : null}

      {documents.map((document, index) => (
        <DocumentRow key={document.id} document={document} last={index === documents.length - 1} />
      ))}
    </View>
  );
}

function DocumentRow({ document, last }: { document: Attachment; last: boolean }) {
  return (
    <Pressable
      className={`h-[72px] flex-row items-center px-7 ${last ? "" : "border-b border-[#2d3745]"}`}
      onPress={() => router.push(`/documents/${document.id}`)}
    >
      <View className="h-[38px] w-[38px] items-center justify-center rounded border border-[#303b49] bg-[#101820]">
        <FileText size={20} color="#ff8374" />
      </View>
      <View className="ml-4 min-w-0 flex-1">
        <Text numberOfLines={1} className="text-[14px] font-black text-[#e5edf8]">{document.original_filename}</Text>
        <Text numberOfLines={1} className="mt-1 text-[12px] font-black text-[#ffd1a4]">Dodano: {formatDate(document.created_at)}</Text>
      </View>
      <View className="ml-4 flex-row items-center rounded border border-[#1a6e4d] bg-[#143a2b] px-3 py-[6px]">
        <Text className="text-[12px] font-black uppercase text-[#20e288]">Zindeksowany</Text>
      </View>
    </Pressable>
  );
}

function DangerActionsCard({ onDeletePress }: { onDeletePress: () => void }) {
  return (
    <View className="rounded-lg border border-[#4a2d31] bg-[#1a212b] px-5 py-5">
      <Text className="text-[18px] font-medium text-[#f4c3c0]">Strefa niebezpieczna</Text>
      <Text className="mt-1 text-[12px] font-medium leading-[17px] text-[#c9aaa5]">Trwałe działania dotyczące pojazdu.</Text>

      <Pressable className="mt-4 h-[45px] flex-row items-center justify-center rounded-md border border-[#f09a91] bg-transparent hover:bg-[#2a1d22]" onPress={onDeletePress}>
        <Trash2 size={15} color="#f09a91" />
        <Text className="ml-3 text-[12px] font-black text-[#f09a91]">Usuń pojazd</Text>
      </Pressable>

      <View className="mt-3 flex-row items-start">
        <AlertTriangle size={14} color="#d7c9b4" />
        <Text className="ml-2 flex-1 text-[11px] font-medium leading-[15px] text-[#d7c9b4]">
          Po usunięciu pojazd zniknie z katalogu maszyn.
        </Text>
      </View>
    </View>
  );
}

function ConfirmationPhraseInput({ onChangeText, value }: { onChangeText: (value: string) => void; value: string }) {
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

function DeleteMachineConfirmationModal({
  deleteError,
  deleting,
  machineName,
  onCancel,
  onConfirm,
  onPhraseChange,
  phrase,
  visible
}: {
  deleteError?: string;
  deleting: boolean;
  machineName: string;
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
              <Text className="text-[20px] font-black text-[#f4c3c0]">Usunąć pojazd?</Text>
              <Text className="mt-2 text-[13px] font-medium leading-[19px] text-[#c9aaa5]">
                Ta operacja jest trwała. Pojazd zostanie usunięty z katalogu maszyn.
              </Text>
            </View>
          </View>

          <View className="mt-5">
            <Text className="text-[12px] font-black uppercase tracking-[0.6px] text-[#d7c9b4]">Pojazd:</Text>
            <Text numberOfLines={2} className="mt-2 text-[15px] font-semibold leading-[20px] text-[#dfe6ef]">{machineName}</Text>
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
              <Text className="ml-2 text-[13px] font-black text-[#111820]">{deleting ? "Usuwanie..." : "Usuń pojazd"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function MachineDetailsScreen() {
  const params = useLocalSearchParams();
  const id = getStringParam(params.id);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [deleteError, setDeleteError] = useState<string>();
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deletePromptVisible, setDeletePromptVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [device, setDevice] = useState<Device>();
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    if (!id) {
      setError("Brak ID maszyny.");
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all([
      fetchJson<Device[]>(WEB_DEVICES_URL, DEVICES_URL, "maszyny"),
      fetchJson<Brand[]>(WEB_BRANDS_URL, BRANDS_URL, "marki"),
      fetchJson<DeviceType[]>(WEB_DEVICE_TYPES_URL, DEVICE_TYPES_URL, "typy maszyn"),
      fetchJson<Attachment[]>(WEB_ATTACHMENTS_URL, ATTACHMENTS_URL, "dokumenty")
    ])
      .then(([deviceItems, brandItems, deviceTypeItems, attachmentItems]) => {
        if (!active) return;
        const machineId = Number(id);
        const selectedDevice = deviceItems.find((item) => item.id === machineId);

        if (!selectedDevice) {
          throw new Error(`Nie znaleziono maszyny o ID ${id}.`);
        }

        setDevice(selectedDevice);
        setBrands(brandItems);
        setDeviceTypes(deviceTypeItems);
        setAttachments(attachmentItems.filter((attachment) => attachment.devices?.some((item) => item.id === machineId)));
        setError(undefined);
      })
      .catch((fetchError: unknown) => {
        if (!active) return;
        setError(fetchError instanceof Error ? fetchError.message : "Nie udalo sie pobrac szczegolow maszyny.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  const brand = useMemo(() => brands.find((item) => item.id === device?.brand_id), [brands, device?.brand_id]);
  const deviceType = useMemo(() => deviceTypes.find((item) => item.id === device?.device_type_id), [deviceTypes, device?.device_type_id]);

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

  async function confirmDeleteMachine() {
    if (!device || deletePhrase.trim() !== DELETE_CONFIRMATION_PHRASE) return;

    setDeleting(true);
    setDeleteError(undefined);

    try {
      await deleteDevice(device.id);
      router.replace("/catalog");
    } catch (deleteFailure) {
      setDeleteError(deleteFailure instanceof Error ? deleteFailure.message : "Nie udało się usunąć pojazdu.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-[#0f161d]" edges={["top", "left", "right"]}>
      <View className="flex-1 flex-row bg-[#0f161d]">
        <AdminSidebar activeSection="catalog" />

        <ScrollView className="min-w-0 flex-1" contentContainerClassName="px-[34px] pb-12 pt-[29px]">
          <Pressable className="mb-5 h-9 self-start flex-row items-center justify-center rounded-lg border border-[rgba(148,163,184,0.18)] bg-transparent px-3 hover:border-[rgba(255,122,0,0.35)] hover:bg-[rgba(255,255,255,0.04)]" onPress={() => router.replace("/catalog")}>
            <ArrowLeft size={17} color="#AAB4C0" strokeWidth={2.5} />
            <Text className="ml-2 text-[13px] font-bold text-[#AAB4C0]">Wroc do katalogu</Text>
          </Pressable>
          <Text numberOfLines={1} className="mb-[31px] text-[28px] font-black leading-[38px] text-[#dfe7f2]">Szczegóły pojazdu</Text>

          {loading ? (
            <View className="min-h-[260px] justify-center rounded-lg border border-[#2d3745] bg-[#1a212b] px-7">
              <Text className="text-[16px] font-black text-[#e5edf8]">Ladowanie szczegolow maszyny...</Text>
            </View>
          ) : null}

          {!loading && error ? (
            <View className="min-h-[260px] justify-center rounded-lg border border-[#965a12] bg-[#1a212b] px-7">
              <Text className="text-[16px] font-black text-[#ff9300]">{error}</Text>
            </View>
          ) : null}

          {!loading && !error && device ? (
            <View className="min-h-[720px] flex-row gap-5 pb-5">
              <MachineImagePreview brand={brand} device={device} />
              <View className="w-[420px] shrink-0">
                <View className="gap-5">
                  <MachineStatusCard documents={attachments} />
                  <MachineInfoCard brand={brand} device={device} deviceType={deviceType} documents={attachments} />
                  <RelatedDocumentsCard deviceId={device.id} documents={attachments} />
                  <DangerActionsCard onDeletePress={openDeletePrompt} />
                </View>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </View>
      <DeleteMachineConfirmationModal
        deleteError={deleteError}
        deleting={deleting}
        machineName={device?.name ?? "Pojazd"}
        onCancel={closeDeletePrompt}
        onConfirm={confirmDeleteMachine}
        onPhraseChange={setDeletePhrase}
        phrase={deletePhrase}
        visible={deletePromptVisible}
      />
    </SafeAreaView>
  );
}

