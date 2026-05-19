import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import dulcorLogo from "./assets/logo-dulcor-alimentos.jpg";
import {
  AlertCircle,
  Camera,
  Check,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  RotateCcw,
  Save,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";

type VerificationType = "documental" | "en_campo";
type StatusType = "cumple" | "no_cumple" | "no_aplica";
type TabType = "checklist" | "resumen" | "hallazgos" | "historial";
type CriticalityType = "critico" | "mayor" | "menor";

type Metrics = {
  totalApplicable: number;
  cumple: number;
  noCumple: number;
  noAplica: number;
  score: number;
};

type ChecklistTemplateItem = {
  id: string;
  text: string;
  criticality: CriticalityType | null;
};

type ChecklistTemplateGroup = {
  category: string;
  items: ChecklistTemplateItem[];
};

type ChecklistRow = {
  id: string;
  number: number;
  category: string;
  item: string;
  criticality: CriticalityType | null;
  status: StatusType;
  observation: string;
  responsible: string;
  photoName: string;
  photoPath: string;
  photoFile: File | null;
  findingSeverity?: string | null;
  findingType?: string | null;
  commitmentDate?: string | null;
  findingStatus?: string | null;
};

type PersistedChecklistRow = Omit<ChecklistRow, "photoFile">;

type HistoryChecklistRow = Partial<PersistedChecklistRow> & {
  status: StatusType;
  findingSeverity?: string | null;
  findingType?: string | null;
  commitmentDate?: string | null;
  findingStatus?: string | null;
};

type InspectionHistoryRow = {
  id: string;
  created_at: string;
  company: string | null;
  plant: string | null;
  sector: string | null;
  auditor: string | null;
  inspection_date: string | null;
  verification_type: VerificationType;
  email: string | null;
  summary: Partial<Metrics> | null;
  findings: HistoryChecklistRow[];
  checklist: HistoryChecklistRow[];
};

type InspectionPayload = {
  id: string;
  company: string;
  plant: string;
  sector: string;
  auditor: string;
  inspection_date: string;
  verification_type: VerificationType;
  email: string;
  summary: Metrics;
  findings: PersistedChecklistRow[];
  checklist: PersistedChecklistRow[];
};

const SUPABASE_URL = "https://vbtppbpiqkjufxisabaj.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZidHBwYnBpcWtqdWZ4aXNhYmFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMDQzNzgsImV4cCI6MjA5MTg4MDM3OH0.RTRLVJtaME9v4c0MPXZJz1z2ePmNJUA-QT5-5zmk4VM";
const SUPABASE_BUCKET = "inspection-photos";
const SUPABASE_INSPECTIONS_TABLE = "inspections";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DOCUMENTAL_CHECKLIST: ChecklistTemplateGroup[] = [
  {
    category: "General y zonificación",
    items: [
      { id: "DOC-GEN-01", text: "El sector posee cartelería visible, vigente y coherente.", criticality: null },
      { id: "DOC-GEN-02", text: "El sector cuenta con un plano de flujo de materiales productivos.", criticality: null },
      { id: "DOC-GEN-03", text: "El sector cuenta con un plano de flujo de producto en proceso.", criticality: null },
      { id: "DOC-GEN-04", text: "El sector cuenta con un plano de flujo de producto terminado.", criticality: null },
      { id: "DOC-GEN-05", text: "El sector cuenta con un plano de circulación de residuos.", criticality: null },
    ],
  },
  {
    category: "Documentación técnica",
    items: [
      { id: "DOC-TEC-01", text: "Existe procedimiento de transferencia definido y aplicado.", criticality: null },
      { id: "DOC-TEC-02", text: "Está disponible y actualizado un plano de la red de desagües.", criticality: null },
      { id: "DOC-TEC-03", text: "Existe mantenimiento preventivo para la red de agua potable.", criticality: null },
      { id: "DOC-TEC-04", text: "La red de aire posee filtros y mantenimiento periódico.", criticality: null },
      { id: "DOC-TEC-05", text: "El sistema de vapor está clasificado según uso.", criticality: null },
    ],
  },
];

const FIELD_CHECKLIST: ChecklistTemplateGroup[] = [
  {
    category: "Flujo de personas y tránsito",
    items: [
      { id: "FLU-PER-01", text: "El ingreso a zonas de mayor riesgo se realiza a través de filtros sanitarios.", criticality: "mayor" },
      { id: "FLU-PER-02", text: "No se observan cruces entre áreas de distinto nivel higiénico.", criticality: "critico" },
      { id: "FLU-PER-03", text: "El tránsito de personas se encuentra definido, señalizado y respeta la segregación entre áreas de distinto nivel de riesgo.", criticality: "mayor" },
      { id: "FLU-PER-04", text: "Las zonas de tránsito están definidas y señalizadas.", criticality: "mayor" },
      { id: "FLU-PER-05", text: "No se evidencian retrocesos en el flujo de personas.", criticality: "mayor" },
      { id: "FLU-PER-06", text: "El acceso a áreas críticas está restringido a personal autorizado.", criticality: "mayor" },
    ],
  },
  {
    category: "Pisos y zócalos",
    items: [
      { id: "PIS-ZOC-01", text: "Los pisos presentan superficies lisas, continuas (sin juntas abiertas ni interrupciones) e impermeables.", criticality: "mayor" },
      { id: "PIS-ZOC-02", text: "Los pisos no presentan grietas, fisuras ni deterioros.", criticality: "mayor" },
      { id: "PIS-ZOC-03", text: "Los pisos presentan pendiente adecuada hacia drenajes.", criticality: "mayor" },
      { id: "PIS-ZOC-04", text: "No se observa acumulación de agua.", criticality: "mayor" },
      { id: "PIS-ZOC-05", text: "Los encuentros piso-pared son de tipo sanitario (media caña: unión curva que evita ángulos rectos y facilita la limpieza).", criticality: "mayor" },
      { id: "PIS-ZOC-06", text: "Los zócalos presentan superficie lisa y sin aberturas.", criticality: "mayor" },
      { id: "PIS-ZOC-07", text: "Los zócalos se encuentran sellados, sin grietas ni aberturas.", criticality: "mayor" },
    ],
  },
  {
    category: "Paredes, techos y condensación",
    items: [
      { id: "PAR-TEC-01", text: "Las paredes presentan superficies lisas, continuas (sin juntas abiertas ni interrupciones) e impermeables.", criticality: "mayor" },
      { id: "PAR-TEC-02", text: "Las paredes no presentan grietas, fisuras ni desprendimientos.", criticality: "mayor" },
      { id: "PAR-TEC-03", text: "Las penetraciones (cañerías, cables, ductos) están selladas.", criticality: "mayor" },
      { id: "PAR-TEC-04", text: "No se observa acumulación de suciedad o humedad en paredes.", criticality: "mayor" },
      { id: "PAR-TEC-05", text: "Los techos no presentan desprendimientos.", criticality: "mayor" },
      { id: "PAR-TEC-06", text: "No hay evidencia de condensación.", criticality: "critico" },
      { id: "PAR-TEC-07", text: "No se observan goteos sobre producto, equipos o superficies.", criticality: "critico" },
    ],
  },
  {
    category: "Drenajes y cierres",
    items: [
      { id: "DRE-CIE-01", text: "Los drenajes funcionan correctamente.", criticality: "critico" },
      { id: "DRE-CIE-02", text: "Los drenajes permiten la evacuación continua de líquidos.", criticality: "critico" },
      { id: "DRE-CIE-03", text: "Los drenajes presentan pendiente adecuada y no se observa acumulación de agua en desagües o áreas circundantes.", criticality: "mayor" },
      { id: "DRE-CIE-04", text: "Las rejillas son removibles y limpiables.", criticality: "mayor" },
      { id: "DRE-CIE-05", text: "Los drenajes cuentan con sistema que evita el retorno de contaminantes.", criticality: "critico" },
      { id: "DRE-CIE-06", text: "No se observan drenajes ubicados debajo de producto expuesto o superficies críticas.", criticality: "critico" },
      { id: "DRE-CIE-07", text: "Los drenajes cuentan con rejillas, mallas o sistemas que evitan el paso de sólidos.", criticality: "mayor" },
    ],
  },
  {
    category: "Puertas y ventanas",
    items: [
      { id: "PUE-VENT-01", text: "Las puertas presentan buen ajuste, sin espacios o fugas.", criticality: "mayor" },
      { id: "PUE-VENT-02", text: "Las puertas cuentan con sistema de cierre automático y permanecen cerradas cuando no están en uso.", criticality: "mayor" },
      { id: "PUE-VENT-03", text: "No se utilizan puertas abiertas como medio de ventilación.", criticality: "mayor" },
      { id: "PUE-VENT-04", text: "Las ventanas están selladas o protegidas cuando corresponde.", criticality: "mayor" },
      { id: "PUE-VENT-05", text: "Las ventanas cuentan con protección contra ingreso de plagas.", criticality: "mayor" },
      { id: "PUE-VENT-06", text: "Los vidrios presentan protección en caso de roturas.", criticality: "mayor" },
      { id: "PUE-VENT-07", text: "El material traslúcido utilizado en ventanas no representa peligro de contaminación en caso de rotura.", criticality: "mayor" },
      { id: "PUE-VENT-08", text: "Las ventanas están instaladas al ras del borde interior o con inclinación que evita la acumulación de suciedad o plagas.", criticality: "menor" },
      { id: "PUE-VENT-09", text: "Los marcos de ventanas están construidos con materiales que evitan la corrosión.", criticality: "menor" },
    ],
  },
  {
    category: "Ventilación",
    items: [
      { id: "VEN-01", text: "El flujo de aire es desde zonas limpias hacia zonas sucias.", criticality: "critico" },
      { id: "VEN-02", text: "El aire no impacta directamente sobre producto expuesto.", criticality: "critico" },
      { id: "VEN-03", text: "Los sistemas de ventilación cuentan con protección contra ingreso de contaminantes.", criticality: "mayor" },
      { id: "VEN-04", text: "No se observan condiciones que favorezcan contaminación por aire.", criticality: "mayor" },
      { id: "VEN-05", text: "En áreas con extracción de aire, se dispone de sistema de reposición de aire filtrado que evita flujo de aire contaminado hacia el producto.", criticality: "critico" },
    ],
  },
  {
    category: "Equipos y estructuras",
    items: [
      { id: "EQU-EST-01", text: "Los equipos permiten la limpieza, inspección y mantenimiento.", criticality: "mayor" },
      { id: "EQU-EST-02", text: "Existe separación adecuada entre equipos y superficies.", criticality: "mayor" },
      { id: "EQU-EST-03", text: "No se observan zonas inaccesibles o puntos ciegos.", criticality: "critico" },
      { id: "EQU-EST-04", text: "Los equipos no están en contacto directo con paredes.", criticality: "mayor" },
      { id: "EQU-EST-05", text: "Las estructuras no presentan huecos ni cavidades.", criticality: "critico" },
      { id: "EQU-EST-06", text: "Las estructuras no acumulan suciedad ni humedad.", criticality: "mayor" },
      { id: "EQU-EST-07", text: "Las estructuras permiten el drenaje de líquidos.", criticality: "mayor" },
    ],
  },
  {
    category: "Servicios",
    items: [
      { id: "SER-01", text: "La red de agua se encuentra en buen estado y sin fugas.", criticality: "mayor" },
      { id: "SER-02", text: "El aire comprimido no presenta condensación ni contaminación visible.", criticality: "critico" },
      { id: "SER-03", text: "Las líneas de vapor no presentan pérdidas.", criticality: "mayor" },
      { id: "SER-04", text: "Las instalaciones no generan riesgo de contaminación sobre producto.", criticality: "mayor" },
      { id: "SER-05", text: "Las conexiones eléctricas están protegidas y no acumulan suciedad.", criticality: "menor" },
    ],
  },
];

function getChecklistGroups(type: VerificationType): ChecklistTemplateGroup[] {
  return type === "en_campo" ? FIELD_CHECKLIST : DOCUMENTAL_CHECKLIST;
}

const statusUi: Record<
  StatusType,
  { label: string; color: string; Icon: typeof CheckCircle2 }
> = {
  cumple: { label: "Cumple", color: "#dcfce7", Icon: CheckCircle2 },
  no_cumple: { label: "No cumple", color: "#fee2e2", Icon: XCircle },
  no_aplica: { label: "No aplica", color: "#e2e8f0", Icon: FileText },
};

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function warnOnDuplicateChecklistIds(
  type: VerificationType,
  groups: ChecklistTemplateGroup[]
) {
  const seen = new Set<string>();

  groups.forEach((group) => {
    group.items.forEach((item) => {
      if (seen.has(item.id)) {
        console.warn(
          `Checklist ${type}: ID duplicado detectado "${item.id}". Revisá la definición del checklist.`
        );
        return;
      }

      seen.add(item.id);
    });
  });
}

function buildRows(type: VerificationType): ChecklistRow[] {
  let visibleNumber = 1;
  const groups = getChecklistGroups(type);

  warnOnDuplicateChecklistIds(type, groups);

  return groups.flatMap((group) =>
    group.items.map((item) => ({
      id: item.id,
      number: visibleNumber++,
      category: group.category,
      item: item.text,
      criticality: item.criticality,
      status: "cumple",
      observation: "",
      responsible: "",
      photoName: "",
      photoPath: "",
      photoFile: null,
      findingSeverity: null,
      findingType: null,
      commitmentDate: null,
      findingStatus: null,
    }))
  );
}

function toPersistedRows(rows: ChecklistRow[]): PersistedChecklistRow[] {
  return rows.map((row) => {
    const { photoFile, ...rest } = row;
    void photoFile;
    return rest;
  });
}

function calculateMetrics(rows: Array<Pick<ChecklistRow, "status">>): Metrics {
  const applicable = rows.filter((row) => row.status !== "no_aplica");
  const totalApplicable = applicable.length;
  const cumple = applicable.filter((row) => row.status === "cumple").length;
  const noCumple = applicable.filter((row) => row.status === "no_cumple").length;
  const noAplica = rows.filter((row) => row.status === "no_aplica").length;
  const score = totalApplicable ? Math.round((cumple / totalApplicable) * 100) : 0;

  return { totalApplicable, cumple, noCumple, noAplica, score };
}

function calculateCriticalMetrics(
  rows: Array<Pick<ChecklistRow, "criticality" | "status">>
) {
  const applicable = rows.filter(
    (row) => row.criticality === "critico" && row.status !== "no_aplica"
  );
  const totalApplicable = applicable.length;
  const cumple = applicable.filter((row) => row.status === "cumple").length;

  return {
    totalApplicable,
    cumple,
    score: totalApplicable ? Math.round((cumple / totalApplicable) * 100) : null,
  };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function uploadPhotoToSupabase(
  file: File,
  inspectionId: string,
  rowId: string
): Promise<{ photoName: string; photoPath: string }> {
  if (!(file instanceof File)) {
    throw new Error("El archivo de foto no es válido.");
  }

  const safeOriginalName = sanitizeFileName(file.name || "foto");
  const safeInspectionId = sanitizeFileName(inspectionId);
  const safeRowId = sanitizeFileName(rowId);
  const objectPath = `${safeInspectionId}/${safeRowId}/${Date.now()}-${safeOriginalName}`;

  const { error } = await supabase.storage.from(SUPABASE_BUCKET).upload(objectPath, file, {
    upsert: false,
    contentType: file.type || undefined,
  });

  if (error) {
    throw new Error(describeSupabaseError(error, "No se pudo subir una foto a Supabase Storage."));
  }

  return { photoName: file.name, photoPath: objectPath };
}

function getPhotoPreviewUrl(row: ChecklistRow): string {
  if (row.photoFile) return "";
  if (!row.photoPath) return "";
  return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${row.photoPath}`;
}

function formatCriticalityLabel(criticality: CriticalityType) {
  if (criticality === "critico") return "Crítico";
  if (criticality === "menor") return "Menor";
  return "Mayor";
}

function formatCriticalityFallback(criticality: CriticalityType | null | undefined) {
  return criticality ? formatCriticalityLabel(criticality) : "Sin criticidad";
}

function getCriticalityChipClassName(criticality: CriticalityType | null | undefined) {
  if (criticality === "critico") return "row-chip row-chip--critical";
  if (criticality === "menor") return "row-chip row-chip--minor";
  return "row-chip row-chip--secondary";
}

function getCriticalityBadgeStyle(
  criticality: CriticalityType | null | undefined
): React.CSSProperties {
  if (criticality === "critico") {
    return {
      background: "#fee2e2",
      border: "1px solid #fca5a5",
      color: "#b91c1c",
    };
  }

  if (criticality === "menor") {
    return {
      background: "#eef2ff",
      border: "1px solid #c7d2fe",
      color: "#4338ca",
    };
  }

  return {
    background: "#f8fafc",
    border: "1px solid #cbd5e1",
    color: "#475569",
  };
}

function formatVerificationTypeLabel(type: VerificationType) {
  return type === "documental" ? "Documental" : "En campo";
}

function formatVisibleNumber(number: number | null | undefined) {
  return typeof number === "number" ? String(number) : "—";
}

function getDisplayNumber(row: Partial<HistoryChecklistRow>, fallbackNumber?: number) {
  if (typeof row.number === "number") return row.number;
  if (typeof fallbackNumber === "number") return fallbackNumber;
  return null;
}

function getDisplayCode(row: Partial<PersistedChecklistRow>) {
  return row.id?.trim() ? row.id : "Sin código estable";
}

function getPhotoReference(row: Partial<PersistedChecklistRow>) {
  return row.photoPath?.trim() || row.photoName?.trim() || "";
}

function formatDateTime(value: Date) {
  return value.toLocaleString("es-AR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildExportFileName(payload: InspectionPayload) {
  return `revision-edilicia-${sanitizeFileName(payload.plant || "planta")}-${
    payload.inspection_date || "sin-fecha"
  }.xlsx`;
}

function buildInspectionSnapshot(input: {
  company: string;
  plant: string;
  sector: string;
  auditor: string;
  inspectionDate: string;
  verificationType: VerificationType;
  email: string;
  rows: ChecklistRow[];
}) {
  return JSON.stringify({
    company: input.company.trim(),
    plant: input.plant.trim(),
    sector: input.sector.trim(),
    auditor: input.auditor.trim(),
    inspectionDate: input.inspectionDate,
    verificationType: input.verificationType,
    email: input.email.trim().toLowerCase(),
    rows: input.rows.map((row) => ({
      id: row.id,
      number: row.number,
      category: row.category,
      item: row.item,
      criticality: row.criticality,
      status: row.status,
      observation: row.observation.trim(),
      responsible: row.responsible.trim(),
      photoRef: row.photoPath || row.photoName || "",
      findingSeverity: row.findingSeverity || "",
      findingType: row.findingType || "",
      commitmentDate: row.commitmentDate || "",
      findingStatus: row.findingStatus || "",
    })),
  });
}

function buildValidationErrors(input: {
  company: string;
  plant: string;
  sector: string;
  auditor: string;
  inspectionDate: string;
  recipientEmail: string;
  confirmRecipientEmail: string;
  rows: ChecklistRow[];
}) {
  const errors: string[] = [];

  if (!input.company.trim()) errors.push("Completa Empresa.");
  if (!input.plant.trim()) errors.push("Completa Planta.");
  if (!input.sector.trim()) errors.push("Completa Sector.");
  if (!input.auditor.trim()) errors.push("Completa Auditor.");
  if (!input.inspectionDate) errors.push("Completa Fecha de inspección.");
  if (!input.recipientEmail.trim()) {
    errors.push("Completa Mail destinatario.");
  } else if (!isValidEmail(input.recipientEmail)) {
    errors.push("El mail destinatario no es válido.");
  }
  if (input.recipientEmail !== input.confirmRecipientEmail) {
    errors.push("La confirmación del mail no coincide.");
  }

  input.rows.forEach((row) => {
    if (row.status !== "no_cumple") return;

    const itemLabel = `${formatVisibleNumber(row.number)} (${row.id})`;

    if (!row.observation.trim()) {
      errors.push(`Ítem ${itemLabel}: falta observación.`);
    }
    if (!row.responsible.trim()) {
      errors.push(`Ítem ${itemLabel}: falta responsable.`);
    }
    if (row.criticality === "critico" && !row.photoFile && !row.photoPath && !row.photoName) {
      errors.push(`Ítem ${itemLabel}: al ser crítico en "No cumple" requiere foto.`);
    }
  });

  return errors;
}

function exportInspectionToExcel(payload: InspectionPayload) {
  const workbook = XLSX.utils.book_new();
  const criticalMetrics = calculateCriticalMetrics(payload.checklist);
  const exportedAt = new Date();

  const resumenRows = [
    ["Campo", "Valor"],
    ["Empresa", payload.company || ""],
    ["Planta", payload.plant || ""],
    ["Sector", payload.sector || ""],
    ["Auditor", payload.auditor || ""],
    ["Fecha inspección", payload.inspection_date || ""],
    ["Tipo de verificación", formatVerificationTypeLabel(payload.verification_type)],
    ["Cumplimiento general", `${payload.summary.score}%`],
    [
      "Cumplimiento críticos",
      criticalMetrics.score === null ? "N/A" : `${criticalMetrics.score}%`,
    ],
    ["Total cumple", payload.summary.cumple],
    ["Total no cumple", payload.summary.noCumple],
    ["Total no aplica", payload.summary.noAplica],
    ["Cantidad de hallazgos", payload.findings.length],
    ["Fecha de exportación", formatDateTime(exportedAt)],
  ];

  const hallazgosRows = payload.findings.map((row) => ({
    "ID del ítem": row.id,
    "Número visible": row.number,
    Categoría: row.category,
    Pregunta: row.item,
    Resultado: statusUi[row.status].label,
    "Criticidad del ítem": formatCriticalityFallback(row.criticality),
    "Severidad del hallazgo, si existe": row.findingSeverity || "",
    "Tipo de hallazgo, si existe": row.findingType || "",
    Observación: row.observation || "",
    Responsable: row.responsible || "",
    "Fecha compromiso, si existe": row.commitmentDate || "",
    "Estado, si existe": row.findingStatus || "",
    "Foto / nombre de foto / URL si existe": getPhotoReference(row),
  }));

  const checklistRows = payload.checklist.map((row) => ({
    "ID del ítem": row.id,
    "Número visible": row.number,
    Categoría: row.category,
    Pregunta: row.item,
    Resultado: statusUi[row.status].label,
    Criticidad: formatCriticalityFallback(row.criticality),
    Observación: row.observation || "",
    Responsable: row.responsible || "",
    Foto: getPhotoReference(row),
  }));

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(resumenRows),
    "Resumen"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(hallazgosRows),
    "Hallazgos"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(checklistRows),
    "Checklist completo"
  );

  XLSX.writeFile(workbook, buildExportFileName(payload));
}

function dedupeHistoryRows(rows: InspectionHistoryRow[]) {
  const seen = new Set<string>();

  return rows.filter((row) => {
    if (!row.id) return true;
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

function resolveSaveError(error: unknown) {
  if (error instanceof TypeError) {
    return "Error de red. Revisá la conexión e intentá guardar nuevamente.";
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "No se pudo guardar la inspección.";
}

function describeSupabaseError(error: unknown, fallbackMessage: string) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    const details =
      "details" in error && typeof error.details === "string" && error.details
        ? ` ${error.details}`
        : "";
    const hint =
      "hint" in error && typeof error.hint === "string" && error.hint
        ? ` ${error.hint}`
        : "";
    return `${error.message}${details}${hint}`.trim();
  }

  return fallbackMessage;
}

function normalizeStatus(value: unknown): StatusType {
  return value === "cumple" || value === "no_cumple" || value === "no_aplica"
    ? value
    : "cumple";
}

function normalizeCriticality(value: unknown): CriticalityType | null {
  return value === "critico" || value === "mayor" || value === "menor" ? value : null;
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeSummary(value: unknown): Partial<Metrics> | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;

  return {
    totalApplicable: normalizeNumber(raw.totalApplicable) ?? undefined,
    cumple: normalizeNumber(raw.cumple) ?? undefined,
    noCumple: normalizeNumber(raw.noCumple) ?? undefined,
    noAplica: normalizeNumber(raw.noAplica) ?? undefined,
    score: normalizeNumber(raw.score) ?? undefined,
  };
}

function normalizeHistoryChecklistRows(value: unknown): HistoryChecklistRow[] {
  if (!Array.isArray(value)) return [];

  return value.map((entry) => {
    const row = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};

    return {
      id: normalizeString(row.id) ?? undefined,
      number: normalizeNumber(row.number) ?? undefined,
      category: normalizeString(row.category) ?? undefined,
      item: normalizeString(row.item) ?? undefined,
      criticality: normalizeCriticality(row.criticality),
      status: normalizeStatus(row.status),
      observation: normalizeString(row.observation) ?? undefined,
      responsible: normalizeString(row.responsible) ?? undefined,
      photoName: normalizeString(row.photoName) ?? undefined,
      photoPath: normalizeString(row.photoPath) ?? undefined,
      findingSeverity: normalizeString(row.findingSeverity) ?? undefined,
      findingType: normalizeString(row.findingType) ?? undefined,
      commitmentDate: normalizeString(row.commitmentDate) ?? undefined,
      findingStatus: normalizeString(row.findingStatus) ?? undefined,
    };
  });
}

function normalizeHistoryRow(value: unknown): InspectionHistoryRow | null {
  if (!value || typeof value !== "object") return null;

  const row = value as Record<string, unknown>;
  const id = normalizeString(row.id);

  if (!id) return null;

  return {
    id,
    created_at: normalizeString(row.created_at) || new Date(0).toISOString(),
    company: normalizeString(row.company),
    plant: normalizeString(row.plant),
    sector: normalizeString(row.sector),
    auditor: normalizeString(row.auditor),
    inspection_date: normalizeString(row.inspection_date),
    verification_type: row.verification_type === "documental" ? "documental" : "en_campo",
    email: normalizeString(row.email),
    summary: normalizeSummary(row.summary),
    findings: normalizeHistoryChecklistRows(row.findings),
    checklist: normalizeHistoryChecklistRows(row.checklist),
  };
}

const box: React.CSSProperties = {
  background: "rgba(255,255,255,0.96)",
  border: "1px solid #e2e8f0",
  borderRadius: 24,
  padding: "clamp(16px, 2vw, 24px)",
  boxShadow: "0 14px 36px rgba(15, 23, 42, 0.06)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  minHeight: 44,
  boxSizing: "border-box",
  padding: "11px 12px",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  font: "inherit",
  lineHeight: 1.2,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 8,
  fontWeight: 600,
  fontSize: 12,
  lineHeight: 1.35,
  letterSpacing: "0.01em",
  color: "#475569",
};

const reviewFieldStyle: React.CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 8,
  alignContent: "start",
};

const reviewLabelStyle: React.CSSProperties = {
  display: "block",
  margin: 0,
  fontWeight: 600,
  fontSize: 12,
  lineHeight: 1.35,
  letterSpacing: "0.01em",
  color: "#475569",
};

const reviewControlStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  minHeight: 44,
  boxSizing: "border-box",
  padding: "11px 12px",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  font: "inherit",
  lineHeight: 1.2,
};

const reviewFeedbackStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  minWidth: 0,
  fontSize: 12,
  lineHeight: 1.4,
};

const buttonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  minHeight: 40,
  minWidth: 0,
  boxSizing: "border-box",
  padding: "9px 14px",
  borderRadius: 999,
  border: "1px solid #cbd5e1",
  background: "rgba(255,255,255,0.92)",
  color: "#0f172a",
  font: "inherit",
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.15,
  cursor: "pointer",
};

const primaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "#0f172a",
  color: "#fff",
  border: "1px solid #0f172a",
  boxShadow: "0 10px 24px rgba(15, 23, 42, 0.18)",
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>("checklist");
  const [company, setCompany] = useState("");
  const [plant, setPlant] = useState("");
  const [sector, setSector] = useState("");
  const [auditor, setAuditor] = useState("");
  const [inspectionDate, setInspectionDate] = useState("");
  const [verificationType, setVerificationType] = useState<VerificationType>("en_campo");
  const [search, setSearch] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [confirmRecipientEmail, setConfirmRecipientEmail] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMode, setSaveMode] = useState<"save" | "save_export" | null>(null);
  const [rows, setRows] = useState<ChecklistRow[]>(() => buildRows("en_campo"));
  const [interactedRowIds, setInteractedRowIds] = useState<string[]>([]);
  const [historyRows, setHistoryRows] = useState<InspectionHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyMessage, setHistoryMessage] = useState("");
  const [historyPlantFilter, setHistoryPlantFilter] = useState("");
  const [historySectorFilter, setHistorySectorFilter] = useState("");
  const [historyTypeFilter, setHistoryTypeFilter] = useState<"todos" | VerificationType>("todos");
  const [historyDateFilter, setHistoryDateFilter] = useState("");
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<InspectionHistoryRow | null>(null);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
  const [historyPhotoUrls, setHistoryPhotoUrls] = useState<Record<string, string>>({});

  const saveLockRef = useRef(false);
  const didLoadHistoryRef = useRef(false);
  const lastSavedRef = useRef<{ snapshotKey: string; payload: InspectionPayload } | null>(null);

  const metrics = useMemo(() => calculateMetrics(rows), [rows]);
  const criticalMetrics = useMemo(() => calculateCriticalMetrics(rows), [rows]);
  const findings = useMemo(() => rows.filter((row) => row.status === "no_cumple"), [rows]);
  const interactedRowSet = useMemo(() => new Set(interactedRowIds), [interactedRowIds]);

  const emailValid = recipientEmail.length > 0 && isValidEmail(recipientEmail);
  const emailMatch = recipientEmail.length > 0 && recipientEmail === confirmRecipientEmail;
  const canFinalize = Boolean(
    company.trim() &&
      plant.trim() &&
      sector.trim() &&
      auditor.trim() &&
      inspectionDate &&
      emailValid &&
      emailMatch
  );

  const clearSaveFeedback = () => {
    setSaveMessage("");
    setSaveError("");
    setValidationErrors([]);
  };

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return rows;

    return rows.filter((row) => {
      return (
        row.category.toLowerCase().includes(q) ||
        row.item.toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q) ||
        String(row.number).includes(q) ||
        row.observation.toLowerCase().includes(q) ||
        row.responsible.toLowerCase().includes(q)
      );
    });
  }, [rows, search]);

  const byCategory = useMemo(() => {
    return getChecklistGroups(verificationType).map((group) => {
      const groupRows = rows.filter(
        (row) => row.category === group.category && row.status !== "no_aplica"
      );
      const cumple = groupRows.filter((row) => row.status === "cumple").length;
      const total = groupRows.length;
      const pendientes = groupRows.filter((row) => row.status === "no_cumple").length;

      return {
        category: group.category,
        total,
        cumple,
        pendientes,
        score: total ? Math.round((cumple / total) * 100) : 0,
      };
    });
  }, [rows, verificationType]);

  const filteredHistoryRows = useMemo(() => {
    return historyRows.filter((item) => {
      const matchPlant =
        !historyPlantFilter ||
        (item.plant || "").toLowerCase().includes(historyPlantFilter.toLowerCase());
      const matchSector =
        !historySectorFilter ||
        (item.sector || "").toLowerCase().includes(historySectorFilter.toLowerCase());
      const matchType =
        historyTypeFilter === "todos" || item.verification_type === historyTypeFilter;
      const matchDate = !historyDateFilter || item.inspection_date === historyDateFilter;
      return matchPlant && matchSector && matchType && matchDate;
    });
  }, [historyRows, historyPlantFilter, historySectorFilter, historyTypeFilter, historyDateFilter]);

  const photoPreviewUrls = useMemo(() => {
    return rows.reduce<Record<string, string>>((acc, row) => {
      if (row.photoFile) {
        acc[row.id] = URL.createObjectURL(row.photoFile);
        return acc;
      }

      const previewUrl = getPhotoPreviewUrl(row);
      if (previewUrl) acc[row.id] = previewUrl;
      return acc;
    }, {});
  }, [rows]);

  useEffect(() => {
    return () => {
      Object.values(photoPreviewUrls).forEach((url) => {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      });
    };
  }, [photoPreviewUrls]);

  useEffect(() => {
    let cancelled = false;

    const directUrls: Record<string, string> = {};
    const photoPaths = Array.from(
      new Set(
        historyRows.flatMap((item) =>
          item.checklist
            .map((row) => row.photoPath)
            .filter((path): path is string => {
              if (!path) return false;
              if (/^https?:\/\//i.test(path)) {
                directUrls[path] = path;
                return false;
              }
              return true;
            })
        )
      )
    );

    if (photoPaths.length === 0) {
      setHistoryPhotoUrls(directUrls);
      return;
    }

    const resolveHistoryPhotoUrls = async () => {
      const { data, error } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .createSignedUrls(photoPaths, 60 * 60);

      if (cancelled) return;

      if (error) {
        console.error("No se pudieron resolver las URLs firmadas del historial:", error);
        setHistoryPhotoUrls(directUrls);
        return;
      }

      const nextUrls = Object.fromEntries(
        (data ?? [])
          .filter((item) => Boolean(item.path && item.signedUrl))
          .map((item) => [item.path as string, item.signedUrl as string])
      );

      setHistoryPhotoUrls({ ...directUrls, ...nextUrls });
    };

    void resolveHistoryPhotoUrls();

    return () => {
      cancelled = true;
    };
  }, [historyRows]);

  const completedChecklistCount = useMemo(() => {
    return rows.filter((row) => {
      return (
        interactedRowSet.has(row.id) ||
        row.status !== "cumple" ||
        Boolean(row.responsible.trim() || row.observation.trim() || row.photoName || row.photoPath)
      );
    }).length;
  }, [rows, interactedRowSet]);

  const checklistProgress = useMemo(() => {
    if (!rows.length) return 0;
    return Math.round((completedChecklistCount / rows.length) * 100);
  }, [completedChecklistCount, rows.length]);

  const executiveSummary = useMemo(() => {
    const typeLabel =
      verificationType === "documental" ? "revisión documental" : "verificación en campo";
    const criticalSummary =
      criticalMetrics.score === null
        ? "Cumplimiento críticos: N/A."
        : `Cumplimiento críticos: ${criticalMetrics.score}%.`;

    return `Inspección de ${typeLabel} en ${plant || "planta"}, sector ${
      sector || "sin sector"
    }. Cumplimiento general ${metrics.score}%. Hallazgos no conformes: ${
      metrics.noCumple
    }. ${criticalSummary} Puntos no aplicables: ${metrics.noAplica}.`;
  }, [verificationType, plant, sector, metrics, criticalMetrics.score]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    setHistoryError("");
    setHistoryMessage("");

    try {
      const { data, error } = await supabase
        .from(SUPABASE_INSPECTIONS_TABLE)
        .select(
          "id, created_at, company, plant, sector, auditor, inspection_date, verification_type, email, summary, findings, checklist"
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error cargando historial desde Supabase:", error);
        throw new Error(
          describeSupabaseError(error, "No se pudo cargar el historial de inspecciones.")
        );
      }

      const normalizedRows = (data ?? [])
        .map((item) => normalizeHistoryRow(item))
        .filter((item): item is InspectionHistoryRow => Boolean(item));

      setHistoryRows(dedupeHistoryRows(normalizedRows));
    } catch (error) {
      console.error("Fallo al cargar historial:", error);
      setHistoryError(
        error instanceof Error ? error.message : "No se pudo cargar el historial."
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (didLoadHistoryRef.current) return;
    didLoadHistoryRef.current = true;
    void loadHistory();
  }, []);

  const deleteInspection = async (item: InspectionHistoryRow) => {
    const confirmed = window.confirm(
      "¿Estás seguro de borrar esta inspección? Esta acción no se puede deshacer."
    );
    if (!confirmed) return;

    setDeletingHistoryId(item.id);
    setHistoryError("");
    setHistoryMessage("");

    const photoPaths = Array.from(
      new Set(
        (item.checklist || [])
          .map((row) => row.photoPath)
          .filter((path): path is string => Boolean(path))
      )
    );

    try {
      const { data: deletedRows, error: deleteError } = await supabase
        .from(SUPABASE_INSPECTIONS_TABLE)
        .delete()
        .eq("id", item.id)
        .select("id");

      if (deleteError) {
        console.error("Error eliminando inspección en Supabase:", deleteError);
        throw new Error(
          describeSupabaseError(deleteError, "No se pudo borrar la inspección seleccionada.")
        );
      }

      if (!deletedRows || deletedRows.length === 0) {
        throw new Error(
          "No se pudo borrar la inspección en Supabase. Revisá permisos RLS o el id del registro."
        );
      }

      if (photoPaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from(SUPABASE_BUCKET)
          .remove(photoPaths);

        if (storageError) {
          console.error("La inspección se borró, pero falló la limpieza de Storage:", storageError);
        }
      }

      await loadHistory();
      setSelectedHistoryItem((prev) => (prev?.id === item.id ? null : prev));
      setHistoryMessage("Inspección eliminada correctamente.");
    } catch (error) {
      console.error("Fallo al eliminar inspección:", error);
      setHistoryError(
        error instanceof Error ? error.message : "No se pudo borrar la inspección."
      );
    } finally {
      setDeletingHistoryId(null);
    }
  };

  const markRowInteracted = (rowId: string) => {
    setInteractedRowIds((prev) => (prev.includes(rowId) ? prev : [...prev, rowId]));
  };

  const updateRow = <K extends keyof ChecklistRow>(rowId: string, field: K, value: ChecklistRow[K]) => {
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)));
  };

  const handleRowFieldChange = <K extends keyof ChecklistRow>(
    rowId: string,
    field: K,
    value: ChecklistRow[K]
  ) => {
    clearSaveFeedback();
    markRowInteracted(rowId);
    updateRow(rowId, field, value);
  };

  const handleStatusChange = (rowId: string, status: StatusType) => {
    clearSaveFeedback();
    markRowInteracted(rowId);
    updateRow(rowId, "status", status);
  };

  const handlePhotoUpload = (rowId: string, file?: File) => {
    if (!file || !(file instanceof File)) return;
    clearSaveFeedback();
    markRowInteracted(rowId);
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId ? { ...row, photoName: file.name, photoPath: "", photoFile: file } : row
      )
    );
  };

  const handlePhotoRemove = (rowId: string) => {
    clearSaveFeedback();
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? { ...row, photoName: "", photoPath: "", photoFile: null }
          : row
      )
    );
  };

  const resetChecklist = () => {
    clearSaveFeedback();
    lastSavedRef.current = null;
    setRows(buildRows(verificationType));
    setInteractedRowIds([]);
    setSearch("");
  };

  const changeType = (value: VerificationType) => {
    clearSaveFeedback();
    lastSavedRef.current = null;
    setVerificationType(value);
    setRows(buildRows(value));
    setInteractedRowIds([]);
    setSearch("");
  };

  const executeSave = async (exportAfterSave: boolean) => {
    if (saveLockRef.current) return;

    clearSaveFeedback();

    const errors = buildValidationErrors({
      company,
      plant,
      sector,
      auditor,
      inspectionDate,
      recipientEmail,
      confirmRecipientEmail,
      rows,
    });

    if (errors.length > 0) {
      setSaveError("No se puede guardar hasta corregir los faltantes.");
      setValidationErrors(errors);
      return;
    }

    const snapshotKey = buildInspectionSnapshot({
      company,
      plant,
      sector,
      auditor,
      inspectionDate,
      verificationType,
      email: recipientEmail,
      rows,
    });

    if (lastSavedRef.current?.snapshotKey === snapshotKey) {
      if (exportAfterSave) {
        try {
          exportInspectionToExcel(lastSavedRef.current.payload);
          setSaveMessage("Inspección guardada correctamente y exportada a Excel.");
        } catch {
          setSaveError("La inspección ya estaba guardada, pero no se pudo generar el Excel.");
        }
      } else {
        setSaveMessage("Inspección guardada correctamente.");
      }
      return;
    }

    saveLockRef.current = true;
    setIsSaving(true);
    setSaveMode(exportAfterSave ? "save_export" : "save");

    try {
      const inspectionId = crypto.randomUUID();
      const rowsWithUploads: ChecklistRow[] = [];

      for (const row of rows) {
        if (!row.photoFile || row.photoPath) {
          rowsWithUploads.push(row);
          continue;
        }

        try {
          const uploaded = await uploadPhotoToSupabase(row.photoFile, inspectionId, row.id);
          rowsWithUploads.push({
            ...row,
            photoName: uploaded.photoName,
            photoPath: uploaded.photoPath,
            photoFile: null,
          });
        } catch (error) {
          console.error("Error subiendo foto:", error);
          const uploadMessage = `No se pudo subir la foto del item ${formatVisibleNumber(
            row.number
          )} / ${row.id}: ${describeSupabaseError(error, "error de Storage")}`;
          throw new Error(uploadMessage);
          throw new Error(
            `No se pudo subir la foto del ítem ${formatVisibleNumber(row.number)} (${row.id}).`
          );
        }
      }

      const summary = calculateMetrics(rowsWithUploads);
      const persistedRows = toPersistedRows(rowsWithUploads);
      const payload: InspectionPayload = {
        id: inspectionId,
        company: company.trim(),
        plant: plant.trim(),
        sector: sector.trim(),
        auditor: auditor.trim(),
        inspection_date: inspectionDate,
        verification_type: verificationType,
        email: recipientEmail.trim(),
        summary,
        findings: persistedRows.filter((row) => row.status === "no_cumple"),
        checklist: persistedRows,
      };

      const { error: upsertError } = await supabase
        .from(SUPABASE_INSPECTIONS_TABLE)
        .upsert(payload, { onConflict: "id" });

      if (upsertError) {
        console.error("Error guardando inspección en Supabase:", upsertError);
        throw new Error(
          describeSupabaseError(upsertError, "No se pudo guardar la inspección en Supabase.")
        );
      }

      setRows(rowsWithUploads);
      lastSavedRef.current = { snapshotKey, payload };
      await loadHistory();

      if (exportAfterSave) {
        try {
          exportInspectionToExcel(payload);
          setSaveMessage("Inspección guardada correctamente y exportada a Excel.");
        } catch (error) {
          console.error("Error exportando Excel:", error);
          setSaveMessage("Inspección guardada correctamente.");
          setSaveError("La inspección se guardó, pero no se pudo generar el archivo Excel.");
        }
      } else {
        setSaveMessage("Inspección guardada correctamente.");
      }
    } catch (error) {
      console.error("Fallo al guardar inspección:", error);
      setSaveError(resolveSaveError(error));
    } finally {
      saveLockRef.current = false;
      setIsSaving(false);
      setSaveMode(null);
    }
  };

  const openMailDraft = () => {
    clearSaveFeedback();

    if (!canFinalize) {
      setSaveError("Completá los datos y verificá el mail antes de enviar resultados.");
      return;
    }

    const subject = encodeURIComponent(
      `Resultado inspección edilicia - ${plant} - ${inspectionDate}`
    );
    const body = encodeURIComponent(
      `${executiveSummary}\n\nAuditor: ${auditor}\nEmpresa: ${company}\nSector: ${sector}\n\nHallazgos no conformes: ${metrics.noCumple}\nCumplimiento general: ${metrics.score}%`
    );

    window.location.href = `mailto:${recipientEmail}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="app-shell">
      <div className="app-layout">
        <div className="corporate-header">
          <div className="corporate-header__logo">
            <img
              className="corporate-header__logo-image"
              src={dulcorLogo}
              alt="Dulcor alimentos"
            />
          </div>
          <div className="corporate-header__title-group">
            <div className="corporate-header__title">Sistema de gestión integrado</div>
            <div className="corporate-header__subtitle">Lista de control - Estructura edilicias</div>
          </div>
          <div className="corporate-header__meta">
            <div className="corporate-header__meta-item">R-CO-PY-002</div>
            <div className="corporate-header__meta-item">Versión N° 1.0</div>
            <div className="corporate-header__meta-item">FV 23/04/2026</div>
          </div>
        </div>

        <div className="app-header app-header--actions-only">
          <div className="app-header__actions">
            <button
              className="ui-button ui-button--header"
              style={buttonStyle}
              onClick={resetChecklist}
              disabled={isSaving}
            >
              <RotateCcw size={16} /> Reiniciar
            </button>
            <button
              className="ui-button ui-button--header"
              style={buttonStyle}
              onClick={() => window.print()}
            >
              <FileText size={16} /> Imprimir / PDF
            </button>
          </div>
        </div>

        <div className="section-card" style={box}>
          <h2 style={{ marginTop: 0 }}>Datos de la revisión</h2>
          <div className="review-grid">
            <div style={reviewFieldStyle}>
              <label style={reviewLabelStyle}>Empresa</label>
              <input
                className="review-control"
                style={reviewControlStyle}
                value={company}
                onChange={(e) => {
                  clearSaveFeedback();
                  setCompany(e.target.value);
                }}
              />
            </div>
            <div style={reviewFieldStyle}>
              <label style={reviewLabelStyle}>Planta</label>
              <input
                className="review-control"
                style={reviewControlStyle}
                value={plant}
                onChange={(e) => {
                  clearSaveFeedback();
                  setPlant(e.target.value);
                }}
              />
            </div>
            <div style={reviewFieldStyle}>
              <label style={reviewLabelStyle}>Sector</label>
              <input
                className="review-control"
                style={reviewControlStyle}
                value={sector}
                onChange={(e) => {
                  clearSaveFeedback();
                  setSector(e.target.value);
                }}
              />
            </div>
            <div style={reviewFieldStyle}>
              <label style={reviewLabelStyle}>Auditor</label>
              <input
                className="review-control"
                style={reviewControlStyle}
                value={auditor}
                onChange={(e) => {
                  clearSaveFeedback();
                  setAuditor(e.target.value);
                }}
              />
            </div>
            <div style={reviewFieldStyle}>
              <label style={reviewLabelStyle}>Fecha</label>
              <input
                className="review-control"
                type="date"
                style={reviewControlStyle}
                value={inspectionDate}
                onChange={(e) => {
                  clearSaveFeedback();
                  setInspectionDate(e.target.value);
                }}
              />
            </div>
            <div style={reviewFieldStyle}>
              <label style={reviewLabelStyle}>Tipo de verificación</label>
              <select
                className="review-control"
                style={reviewControlStyle}
                value={verificationType}
                onChange={(e) => changeType(e.target.value as VerificationType)}
                disabled={isSaving}
              >
                <option value="documental">Documental</option>
                <option value="en_campo">En campo</option>
              </select>
            </div>
            <div style={reviewFieldStyle}>
              <label style={reviewLabelStyle}>Mail destinatario</label>
              <input
                className="review-control"
                style={reviewControlStyle}
                value={recipientEmail}
                onChange={(e) => {
                  clearSaveFeedback();
                  setRecipientEmail(e.target.value);
                }}
              />
              {recipientEmail.length > 0 && !emailValid && (
                <div style={{ ...reviewFeedbackStyle, color: "#dc2626" }}>
                  <AlertCircle size={13} style={{ verticalAlign: "middle", marginRight: 4 }} />
                  Mail inválido
                </div>
              )}
            </div>
            <div style={reviewFieldStyle}>
              <label style={reviewLabelStyle}>Confirmar mail</label>
              <input
                className="review-control"
                style={reviewControlStyle}
                value={confirmRecipientEmail}
                onChange={(e) => {
                  clearSaveFeedback();
                  setConfirmRecipientEmail(e.target.value);
                }}
              />
              {confirmRecipientEmail.length > 0 && (
                <div
                  style={{
                    ...reviewFeedbackStyle,
                    color: emailMatch ? "#16a34a" : "#dc2626",
                  }}
                >
                  {emailMatch ? (
                    <Check size={13} style={{ verticalAlign: "middle", marginRight: 4 }} />
                  ) : (
                    <AlertCircle size={13} style={{ verticalAlign: "middle", marginRight: 4 }} />
                  )}
                  {emailMatch ? "El mail coincide" : "El mail no coincide"}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="section-card summary-card" style={box}>
          <h2 style={{ marginTop: 0 }}>Resumen ejecutivo</h2>
          <div className="summary-panel">{executiveSummary}</div>
        </div>

        <div className="kpi-grid">
          <div className="section-card kpi-card" style={box}>
            <div className="kpi-label">Cumplimiento general</div>
            <div className="kpi-value">{metrics.score}%</div>
          </div>
          <div className="section-card kpi-card kpi-card--success" style={box}>
            <div className="kpi-label">Cumple</div>
            <div className="kpi-value" style={{ color: "#15803d" }}>{metrics.cumple}</div>
          </div>
          <div className="section-card kpi-card kpi-card--danger" style={box}>
            <div className="kpi-label">No cumple</div>
            <div className="kpi-value" style={{ color: "#dc2626" }}>{metrics.noCumple}</div>
          </div>
          <div className="section-card kpi-card" style={box}>
            <div className="kpi-label">No aplica</div>
            <div className="kpi-value">{metrics.noAplica}</div>
          </div>
        </div>

        <div className="section-card tabs-card" style={box}>
          <div className="tabs-scroll">
            <div className="tabs-list">
              <button
                className={`tab-button ${activeTab === "checklist" ? "tab-button--active" : ""}`}
                style={activeTab === "checklist" ? primaryButtonStyle : buttonStyle}
                onClick={() => setActiveTab("checklist")}
              >
                Checklist
              </button>
              <button
                className={`tab-button ${activeTab === "resumen" ? "tab-button--active" : ""}`}
                style={activeTab === "resumen" ? primaryButtonStyle : buttonStyle}
                onClick={() => setActiveTab("resumen")}
              >
                Resumen
              </button>
              <button
                className={`tab-button ${activeTab === "hallazgos" ? "tab-button--active" : ""}`}
                style={activeTab === "hallazgos" ? primaryButtonStyle : buttonStyle}
                onClick={() => setActiveTab("hallazgos")}
              >
                Hallazgos
              </button>
              <button
                className={`tab-button ${activeTab === "historial" ? "tab-button--active" : ""}`}
                style={activeTab === "historial" ? primaryButtonStyle : buttonStyle}
                onClick={() => setActiveTab("historial")}
              >
                Historial
              </button>
            </div>
          </div>
        </div>

        {activeTab === "checklist" && (
          <div className="section-card" style={box}>
            <div className="checklist-toolbar">
              <div className="checklist-progress">
                <div className="checklist-progress__meta">
                  <span className="checklist-progress__eyebrow">Progreso del checklist</span>
                  <strong>
                    {completedChecklistCount} / {rows.length} completados ({checklistProgress}%)
                  </strong>
                </div>
                <div className="checklist-progress__track" aria-hidden="true">
                  <div
                    className="checklist-progress__fill"
                    style={{ width: `${checklistProgress}%` }}
                  />
                </div>
              </div>
              <div className="checklist-toolbar__controls">
                <input
                  className="checklist-search"
                  style={{ ...inputStyle, maxWidth: "none" }}
                  placeholder="Buscar por categoría, punto, código, observación o responsable"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="checklist-toolbar__summary">
                  Mostrando checklist de:{" "}
                  <strong>{formatVerificationTypeLabel(verificationType)}</strong>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              {filteredRows.map((row) => {
                const ui = statusUi[row.status];
                const Icon = ui.Icon;
                const photoPreviewUrl = photoPreviewUrls[row.id];
                const rowCompleted =
                  interactedRowSet.has(row.id) ||
                  row.status !== "cumple" ||
                  Boolean(
                    row.responsible.trim() ||
                      row.observation.trim() ||
                      row.photoName ||
                      row.photoPath
                  );

                return (
                  <div
                    key={row.id}
                    className={`checklist-item-card ${
                      rowCompleted ? "checklist-item-card--completed" : ""
                    }`}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 14,
                      padding: 16,
                      background: "#fff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        flexWrap: "wrap",
                        marginBottom: 14,
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                          <div
                            style={{
                              display: "inline-block",
                              fontSize: 12,
                              padding: "4px 8px",
                              background: "#f1f5f9",
                              borderRadius: 999,
                            }}
                          >
                            {row.category}
                          </div>
                          <div className="row-chip">N° {row.number}</div>
                          <div className="row-chip row-chip--code">{row.id}</div>
                          {row.criticality ? (
                            <div
                              style={{
                                display: "inline-block",
                                fontSize: 12,
                                padding: "4px 8px",
                                borderRadius: 999,
                                fontWeight: 700,
                                ...getCriticalityBadgeStyle(row.criticality),
                              }}
                            >
                              {formatCriticalityLabel(row.criticality)}
                            </div>
                          ) : (
                            <div className="row-chip row-chip--secondary">Sin criticidad</div>
                          )}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>
                          {row.number}. {row.item}
                        </div>
                      </div>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          background: ui.color,
                          padding: "6px 10px",
                          borderRadius: 999,
                          height: "fit-content",
                        }}
                      >
                        <Icon size={14} />
                        {ui.label}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
                        gap: 14,
                      }}
                    >
                      <div>
                        <label style={labelStyle}>Resultado</label>
                        <div className="status-toggle" role="group" aria-label={`Resultado de ${row.item}`}>
                          {(Object.entries(statusUi) as [StatusType, (typeof statusUi)[StatusType]][]).map(
                            ([status, statusOption]) => (
                              <button
                                key={status}
                                type="button"
                                className={`status-toggle__button ${
                                  row.status === status ? "status-toggle__button--active" : ""
                                }`}
                                data-status={status}
                                onClick={() => handleStatusChange(row.id, status)}
                              >
                                {statusOption.label}
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      <div>
                        <label style={labelStyle}>Responsable</label>
                        <input
                          style={inputStyle}
                          value={row.responsible}
                          onChange={(e) =>
                            handleRowFieldChange(row.id, "responsible", e.target.value)
                          }
                        />
                      </div>

                      <div className="photo-field">
                        <label style={labelStyle}>Foto</label>
                        <div className={`photo-panel ${photoPreviewUrl ? "photo-panel--filled" : ""}`}>
                          {photoPreviewUrl ? (
                            <img
                              className="photo-panel__preview"
                              src={photoPreviewUrl}
                              alt={`Foto del ítem ${row.item}`}
                            />
                          ) : null}
                          <div className="photo-panel__content">
                            <div className="photo-panel__status">
                              {photoPreviewUrl ? "Foto cargada" : "Sin foto"}
                            </div>
                            {row.photoName && (
                              <div className="photo-panel__filename">{row.photoName}</div>
                            )}
                            <div className="photo-panel__actions">
                              <label className="photo-action photo-action--primary">
                                <Camera size={16} />
                                {photoPreviewUrl ? "Cambiar foto" : "Agregar foto"}
                                <input
                                  type="file"
                                  accept="image/*"
                                  style={{ display: "none" }}
                                  onChange={(e) => handlePhotoUpload(row.id, e.target.files?.[0])}
                                />
                              </label>
                              {photoPreviewUrl && (
                                <button
                                  type="button"
                                  className="photo-action"
                                  onClick={() => handlePhotoRemove(row.id)}
                                >
                                  <XCircle size={16} />
                                  Eliminar foto
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div style={{ gridColumn: "1 / -1" }}>
                        <label style={labelStyle}>Observación</label>
                        <textarea
                          style={{ ...inputStyle, minHeight: 90 }}
                          value={row.observation}
                          onChange={(e) =>
                            handleRowFieldChange(row.id, "observation", e.target.value)
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "resumen" && (
          <div className="section-card" style={box}>
            <h2 style={{ marginTop: 0 }}>Resumen por categoría</h2>
            <div className="summary-metrics">
              <div className="summary-metric-card">
                <div className="summary-metric-card__label">Cumplimiento total</div>
                <div className="summary-metric-card__value">{metrics.score}%</div>
                <div className="summary-metric-card__caption">
                  {metrics.cumple} de {metrics.totalApplicable} ítems aplicables
                </div>
              </div>
              <div className="summary-metric-card summary-metric-card--critical">
                <div className="summary-metric-card__label">Cumplimiento críticos</div>
                <div className="summary-metric-card__value">
                  {criticalMetrics.score === null ? "N/A" : `${criticalMetrics.score}%`}
                </div>
                <div className="summary-metric-card__caption">
                  {criticalMetrics.score === null
                    ? "Sin ítems críticos aplicables"
                    : `${criticalMetrics.cumple} de ${criticalMetrics.totalApplicable} críticos aplicables`}
                </div>
              </div>
              <div className="summary-metric-card summary-metric-card--finding">
                <div className="summary-metric-card__label">Hallazgos</div>
                <div className="summary-metric-card__value">{findings.length}</div>
                <div className="summary-metric-card__caption">Ítems con resultado no cumple</div>
              </div>
            </div>
            <div
              className="summary-category-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
                gap: 14,
              }}
            >
              {byCategory.map((cat) => (
                <div
                  key={cat.category}
                  className="summary-category-card"
                  style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 14 }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>{cat.category}</div>
                  <div style={{ marginBottom: 8 }}>
                    Cumplimiento: <strong>{cat.score}%</strong>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                    <div style={{ background: "#f8fafc", borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 12, color: "#64748b" }}>Puntos</div>
                      <div style={{ fontWeight: 700 }}>{cat.total}</div>
                    </div>
                    <div style={{ background: "#ecfdf5", borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 12, color: "#64748b" }}>Cumple</div>
                      <div style={{ fontWeight: 700, color: "#16a34a" }}>{cat.cumple}</div>
                    </div>
                    <div style={{ background: "#fef2f2", borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 12, color: "#64748b" }}>No cumple</div>
                      <div style={{ fontWeight: 700, color: "#dc2626" }}>{cat.pendientes}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "hallazgos" && (
          <div className="section-card" style={box}>
            <h2 style={{ marginTop: 0 }}>Hallazgos con acción requerida</h2>
            {findings.length === 0 ? (
              <div style={{ color: "#64748b" }}>No hay hallazgos cargados como no cumple.</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {findings.map((item) => (
                  <div
                    key={item.id}
                    className="finding-card"
                    style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 14 }}
                  >
                    <div className="row-meta">
                      <span className="row-chip">{item.category}</span>
                      <span className="row-chip">N° {formatVisibleNumber(item.number)}</span>
                      <span className="row-chip row-chip--code">{item.id}</span>
                      <span className={getCriticalityChipClassName(item.criticality)}>
                        {formatCriticalityFallback(item.criticality)}
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>
                      {item.number}. {item.item}
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
                        gap: 10,
                      }}
                    >
                      <div><strong>Observación:</strong> {item.observation || "-"}</div>
                      <div><strong>Responsable:</strong> {item.responsible || "-"}</div>
                      <div><strong>Foto:</strong> {item.photoName || item.photoPath || "-"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "historial" && (
          <div className="section-card" style={box}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 14,
              }}
            >
              <h2 style={{ margin: 0 }}>Historial de inspecciones</h2>
              <button className="ui-button" style={buttonStyle} onClick={() => void loadHistory()}>
                <RotateCcw size={16} /> Actualizar historial
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <input
                style={inputStyle}
                placeholder="Filtrar por planta"
                value={historyPlantFilter}
                onChange={(e) => setHistoryPlantFilter(e.target.value)}
              />
              <input
                style={inputStyle}
                placeholder="Filtrar por sector"
                value={historySectorFilter}
                onChange={(e) => setHistorySectorFilter(e.target.value)}
              />
              <select
                style={inputStyle}
                value={historyTypeFilter}
                onChange={(e) =>
                  setHistoryTypeFilter(e.target.value as "todos" | VerificationType)
                }
              >
                <option value="todos">Todos</option>
                <option value="documental">Documental</option>
                <option value="en_campo">En campo</option>
              </select>
              <input
                type="date"
                style={inputStyle}
                value={historyDateFilter}
                onChange={(e) => setHistoryDateFilter(e.target.value)}
              />
            </div>

            {historyMessage && (
              <div
                style={{
                  marginBottom: 14,
                  padding: 12,
                  borderRadius: 12,
                  background: "#dcfce7",
                  color: "#166534",
                }}
              >
                {historyMessage}
              </div>
            )}

            {historyLoading ? (
              <div style={{ color: "#64748b" }}>Cargando historial...</div>
            ) : historyError ? (
              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  background: "#fee2e2",
                  color: "#991b1b",
                }}
              >
                {historyError}
              </div>
            ) : filteredHistoryRows.length === 0 ? (
              <div style={{ color: "#64748b" }}>No hay inspecciones guardadas todavía.</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {filteredHistoryRows.map((item) => (
                  <div
                    key={item.id}
                    className="history-record"
                    style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 14 }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>
                          {formatVerificationTypeLabel(item.verification_type)}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>
                          {item.company || "Sin empresa"} · {item.plant || "Sin planta"}
                        </div>
                        <div style={{ color: "#475569" }}>
                          Sector: {item.sector || "-"} · Auditor: {item.auditor || "-"}
                        </div>
                      </div>
                      <div style={{ color: "#475569", fontSize: 14 }}>
                        <div>Fecha inspección: {item.inspection_date || "-"}</div>
                        <div>Guardado: {new Date(item.created_at).toLocaleString()}</div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                        gap: 10,
                        marginTop: 12,
                      }}
                    >
                      <div style={{ background: "#f8fafc", borderRadius: 10, padding: 10 }}>
                        <div style={{ fontSize: 12, color: "#64748b" }}>Cumplimiento</div>
                        <div style={{ fontWeight: 700 }}>{item.summary?.score ?? 0}%</div>
                      </div>
                      <div style={{ background: "#ecfdf5", borderRadius: 10, padding: 10 }}>
                        <div style={{ fontSize: 12, color: "#64748b" }}>Cumple</div>
                        <div style={{ fontWeight: 700, color: "#16a34a" }}>
                          {item.summary?.cumple ?? 0}
                        </div>
                      </div>
                      <div style={{ background: "#fef2f2", borderRadius: 10, padding: 10 }}>
                        <div style={{ fontSize: 12, color: "#64748b" }}>No cumple</div>
                        <div style={{ fontWeight: 700, color: "#dc2626" }}>
                          {item.summary?.noCumple ?? 0}
                        </div>
                      </div>
                      <div style={{ background: "#f1f5f9", borderRadius: 10, padding: 10 }}>
                        <div style={{ fontSize: 12, color: "#64748b" }}>No aplica</div>
                        <div style={{ fontWeight: 700 }}>{item.summary?.noAplica ?? 0}</div>
                      </div>
                    </div>

                    <div style={{ marginTop: 10, color: "#475569" }}>
                      Mail destinatario: {item.email || "-"} · Hallazgos guardados:{" "}
                      {item.findings?.length ?? 0}
                    </div>

                    <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button
                        className="ui-button"
                        style={buttonStyle}
                        onClick={() => setSelectedHistoryItem(item)}
                      >
                        <Eye size={16} /> Ver detalle
                      </button>
                      <button
                        className="ui-button ui-button--danger"
                        style={buttonStyle}
                        onClick={() => void deleteInspection(item)}
                        disabled={deletingHistoryId === item.id}
                      >
                        <Trash2 size={16} />
                        {deletingHistoryId === item.id ? "Borrando..." : "Borrar"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selectedHistoryItem && (
              <div
                style={{
                  marginTop: 16,
                  border: "1px solid #cbd5e1",
                  borderRadius: 14,
                  padding: 14,
                  background: "#f8fafc",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0 }}>Detalle de inspección</h3>
                    <div style={{ color: "#475569" }}>
                      {selectedHistoryItem.company || "Sin empresa"} ·{" "}
                      {selectedHistoryItem.plant || "Sin planta"} ·{" "}
                      {formatVerificationTypeLabel(selectedHistoryItem.verification_type)}
                    </div>
                  </div>
                  <button
                    className="ui-button"
                    style={buttonStyle}
                    onClick={() => setSelectedHistoryItem(null)}
                  >
                    Cerrar detalle
                  </button>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {(selectedHistoryItem.checklist || []).map((row, index) => {
                    const detailPhotoUrl = row.photoPath ? historyPhotoUrls[row.photoPath] || "" : "";
                    const displayNumber = getDisplayNumber(row, index + 1);
                    const displayCode = getDisplayCode(row);

                    return (
                      <div
                        key={`${displayCode}-${index}`}
                        className="history-detail-row"
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 12,
                          padding: 12,
                        }}
                      >
                        <div className="row-meta">
                          <span className="row-chip">{row.category || "Sin categoría"}</span>
                          <span className="row-chip">N° {formatVisibleNumber(displayNumber)}</span>
                          <span className="row-chip row-chip--code">{displayCode}</span>
                          <span className={getCriticalityChipClassName(row.criticality)}>
                            {formatCriticalityFallback(row.criticality)}
                          </span>
                        </div>
                        <div style={{ fontWeight: 700 }}>
                          {displayNumber ? `${displayNumber}. ` : ""}
                          {row.item || "Sin texto"}
                        </div>
                        <div className="history-detail-row__grid">
                          <div><strong>Resultado:</strong> {statusUi[row.status].label}</div>
                          <div><strong>Observación:</strong> {row.observation || "-"}</div>
                          <div><strong>Responsable:</strong> {row.responsible || "-"}</div>
                          <div><strong>Foto:</strong> {row.photoName || row.photoPath || "-"}</div>
                        </div>
                        {detailPhotoUrl ? (
                          <div className="history-photo">
                            <img
                              className="history-photo__preview"
                              src={detailPhotoUrl}
                              alt={`Foto asociada al ítem ${displayCode}`}
                            />
                          </div>
                        ) : row.photoPath ? (
                          <div className="history-photo history-photo--fallback">
                            {row.photoName ? `Foto guardada: ${row.photoName}` : "Foto no disponible"}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="section-card" style={box}>
          <h2 style={{ marginTop: 0 }}>Finalizar inspección</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="ui-button ui-button--primary"
              style={primaryButtonStyle}
              onClick={() => void executeSave(false)}
              disabled={isSaving}
            >
              <Save size={16} /> {saveMode === "save" ? "Guardando..." : "Guardar online"}
            </button>
            <button
              className="ui-button"
              style={buttonStyle}
              onClick={() => void executeSave(true)}
              disabled={isSaving}
            >
              <Download size={16} />{" "}
              {saveMode === "save_export" ? "Guardando..." : "Guardar y exportar Excel"}
            </button>
            <button className="ui-button" style={buttonStyle} onClick={openMailDraft}>
              <Send size={16} /> Enviar resultados
            </button>
          </div>

          {!canFinalize && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 12,
                background: "#fef3c7",
                color: "#92400e",
              }}
            >
              Para finalizar, completá empresa, planta, sector, auditor, fecha y un mail válido con confirmación correcta.
            </div>
          )}

          {saveMessage && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 12,
                background: "#dcfce7",
                color: "#166534",
              }}
            >
              {saveMessage}
            </div>
          )}

          {saveError && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 12,
                background: "#fee2e2",
                color: "#991b1b",
              }}
            >
              {saveError}
              {validationErrors.length > 0 && (
                <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
                  {validationErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
