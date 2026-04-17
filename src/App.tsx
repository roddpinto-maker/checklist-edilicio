import React, { useEffect, useMemo, useState } from "react";
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
  XCircle,
} from "lucide-react";

type VerificationType = "documental" | "en_campo";
type StatusType = "cumple" | "no_cumple" | "no_aplica";
type TabType = "checklist" | "resumen" | "hallazgos" | "historial";

type Metrics = {
  totalApplicable: number;
  cumple: number;
  noCumple: number;
  noAplica: number;
  score: number;
};

type ChecklistRow = {
  id: string;
  category: string;
  item: string;
  status: StatusType;
  observation: string;
  responsible: string;
  photoName: string;
  photoPath: string;
  photoFile: File | null;
};

type PersistedChecklistRow = Omit<ChecklistRow, "photoFile">;

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
  summary: Metrics;
  findings: PersistedChecklistRow[];
  checklist: PersistedChecklistRow[];
};

const SUPABASE_URL = "https://vbtppbpiqkjufxisabaj.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZidHBwYnBpcWtqdWZ4aXNhYmFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMDQzNzgsImV4cCI6MjA5MTg4MDM3OH0.RTRLVJtaME9v4c0MPXZJz1z2ePmNJUA-QT5-5zmk4VM";
const SUPABASE_BUCKET = "inspection-photos";

const CHECKLISTS: Record<VerificationType, { category: string; items: string[] }[]> = {
  documental: [
    {
      category: "General y zonificación",
      items: [
        "El sector posee cartelería visible, vigente y coherente.",
        "El sector cuenta con un plano de flujo de materiales productivos.",
        "El sector cuenta con un plano de flujo de producto en proceso.",
        "El sector cuenta con un plano de flujo de producto terminado.",
        "El sector cuenta con un plano de circulación de residuos.",
      ],
    },
    {
      category: "Documentación técnica",
      items: [
        "Existe procedimiento de transferencia definido y aplicado.",
        "Está disponible y actualizado un plano de la red de desagües.",
        "Existe mantenimiento preventivo para la red de agua potable.",
        "La red de aire posee filtros y mantenimiento periódico.",
        "El sistema de vapor está clasificado según uso.",
      ],
    },
  ],
  en_campo: [
    {
      category: "Flujo de personas y tránsito",
      items: [
        "El ingreso a zonas de mayor riesgo se realiza a través de filtros sanitarios.",
        "No se observan cruces entre áreas de distinto nivel higiénico.",
        "El tránsito entre sectores está controlado para evitar contaminación cruzada.",
        "Las zonas de tránsito están definidas y señalizadas.",
      ],
    },
    {
      category: "Pisos y zócalos",
      items: [
        "Los pisos son lisos, impermeables y de fácil limpieza.",
        "No presentan grietas, fisuras ni deterioros.",
        "Presentan pendiente adecuada hacia drenajes.",
        "No se observa acumulación de agua.",
      ],
    },
    {
      category: "Paredes, techos y condensación",
      items: [
        "Las paredes son lisas, continuas e impermeables.",
        "Las penetraciones están selladas.",
        "Los techos no presentan desprendimientos ni suciedad acumulada.",
        "No hay evidencia de condensación.",
      ],
    },
    {
      category: "Drenajes y cierres",
      items: [
        "Los drenajes funcionan correctamente.",
        "Las rejillas son removibles y limpiables.",
        "Las puertas presentan buen ajuste.",
        "Las ventanas están selladas o protegidas cuando corresponde.",
      ],
    },
  ],
};

const statusUi: Record<
  StatusType,
  { label: string; color: string; Icon: typeof CheckCircle2 }
> = {
  cumple: { label: "Cumple", color: "#dcfce7", Icon: CheckCircle2 },
  no_cumple: { label: "No cumple", color: "#fee2e2", Icon: XCircle },
  no_aplica: { label: "No aplica", color: "#e2e8f0", Icon: FileText },
};

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function buildRows(type: VerificationType): ChecklistRow[] {
  return CHECKLISTS[type].flatMap((group, gi) =>
    group.items.map((item, ii) => ({
      id: `${type}-${gi}-${ii}-${slugify(item).slice(0, 18)}`,
      category: group.category,
      item,
      status: "cumple",
      observation: "",
      responsible: "",
      photoName: "",
      photoPath: "",
      photoFile: null,
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

function calculateMetrics(rows: ChecklistRow[]): Metrics {
  const applicable = rows.filter((r) => r.status !== "no_aplica");
  const totalApplicable = applicable.length;
  const cumple = applicable.filter((r) => r.status === "cumple").length;
  const noCumple = applicable.filter((r) => r.status === "no_cumple").length;
  const noAplica = rows.filter((r) => r.status === "no_aplica").length;
  const score = totalApplicable ? Math.round((cumple / totalApplicable) * 100) : 0;
  return { totalApplicable, cumple, noCumple, noAplica, score };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function uploadPhotoToSupabase(
  file: File,
  inspectionId: string,
  rowId: string
): Promise<{ photoName: string; photoPath: string }> {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const fileName = `${rowId}-${Date.now()}.${ext}`;
  const objectPath = `${inspectionId}/${sanitizeFileName(fileName)}`;

  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${objectPath}`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "true",
      },
      body: file,
    }
  );

  if (!response.ok) {
    throw new Error("No se pudo subir una foto a Supabase Storage.");
  }

  return { photoName: file.name, photoPath: objectPath };
}

function getPhotoPreviewUrl(row: ChecklistRow): string {
  if (row.photoFile) return "";
  if (!row.photoPath) return "";
  return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${row.photoPath}`;
}

function saveJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
  const [isSaving, setIsSaving] = useState(false);
  const [rows, setRows] = useState<ChecklistRow[]>(() => buildRows("en_campo"));
  const [interactedRowIds, setInteractedRowIds] = useState<string[]>([]);
  const [historyRows, setHistoryRows] = useState<InspectionHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyPlantFilter, setHistoryPlantFilter] = useState("");
  const [historySectorFilter, setHistorySectorFilter] = useState("");
  const [historyTypeFilter, setHistoryTypeFilter] = useState<"todos" | VerificationType>("todos");
  const [historyDateFilter, setHistoryDateFilter] = useState("");
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<InspectionHistoryRow | null>(null);

  const metrics = useMemo(() => calculateMetrics(rows), [rows]);
  const findings = useMemo(() => rows.filter((r) => r.status === "no_cumple"), [rows]);
  const interactedRowSet = useMemo(() => new Set(interactedRowIds), [interactedRowIds]);

  const emailValid = recipientEmail.length > 0 && isValidEmail(recipientEmail);
  const emailMatch = recipientEmail.length > 0 && recipientEmail === confirmRecipientEmail;
  const canFinalize = Boolean(
    company && plant && sector && auditor && inspectionDate && emailValid && emailMatch
  );

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.category.toLowerCase().includes(q) ||
        row.item.toLowerCase().includes(q) ||
        row.observation.toLowerCase().includes(q) ||
        row.responsible.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const byCategory = useMemo(() => {
    return CHECKLISTS[verificationType].map((group) => {
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
    return `Inspección de ${typeLabel} en ${plant || "planta"}, sector ${
      sector || "sin sector"
    }. Cumplimiento general ${metrics.score}%. Hallazgos no conformes: ${
      metrics.noCumple
    }. Puntos no aplicables: ${metrics.noAplica}.`;
  }, [verificationType, plant, sector, metrics]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/inspections?select=*&order=created_at.desc`,
        {
          method: "GET",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("No se pudo cargar el historial de inspecciones.");
      }

      const data = (await response.json()) as InspectionHistoryRow[];
      setHistoryRows(data);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "No se pudo cargar el historial.");
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, []);

  const markRowInteracted = (rowId: string) => {
    setInteractedRowIds((prev) => (prev.includes(rowId) ? prev : [...prev, rowId]));
  };

  const updateRow = (rowId: string, field: keyof ChecklistRow, value: string) => {
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)));
  };

  const handleRowFieldChange = (rowId: string, field: keyof ChecklistRow, value: string) => {
    markRowInteracted(rowId);
    updateRow(rowId, field, value);
  };

  const handleStatusChange = (rowId: string, status: StatusType) => {
    markRowInteracted(rowId);
    updateRow(rowId, "status", status);
  };

  const handlePhotoUpload = (rowId: string, file?: File) => {
    if (!file) return;
    markRowInteracted(rowId);
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId ? { ...row, photoName: file.name, photoPath: "", photoFile: file } : row
      )
    );
  };

  const handlePhotoRemove = (rowId: string) => {
    setInteractedRowIds((prev) => prev.filter((id) => id !== rowId));
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? { ...row, photoName: "", photoPath: "", photoFile: null }
          : row
      )
    );
  };

  const resetChecklist = () => {
    setRows(buildRows(verificationType));
    setInteractedRowIds([]);
    setSearch("");
    setSaveMessage("");
    setSaveError("");
  };

  const changeType = (value: VerificationType) => {
    setVerificationType(value);
    setRows(buildRows(value));
    setInteractedRowIds([]);
    setSearch("");
    setSaveMessage("");
    setSaveError("");
  };

  const exportJson = () => {
    try {
      const data = {
        id: `INSP-${Date.now()}`,
        createdAt: new Date().toISOString(),
        encabezado: {
          company,
          plant,
          sector,
          auditor,
          inspectionDate,
          verificationType,
          email: recipientEmail,
        },
        resumen: metrics,
        hallazgos: toPersistedRows(rows).filter((row) => row.status === "no_cumple"),
        checklist: toPersistedRows(rows),
      };
      saveJson(
        `revision-edilicia-${plant || "planta"}-${inspectionDate || "sin-fecha"}.json`,
        data
      );
      setSaveMessage("Archivo JSON exportado correctamente.");
      setSaveError("");
    } catch {
      setSaveError("No se pudo exportar el archivo JSON.");
      setSaveMessage("");
    }
  };

  const saveOnline = async () => {
    setSaveMessage("");
    setSaveError("");

    if (!canFinalize) {
      setSaveError(
        "Completá empresa, planta, sector, auditor, fecha y un mail válido con confirmación correcta."
      );
      return;
    }

    setIsSaving(true);

    try {
      const inspectionId = crypto.randomUUID();

      const rowsWithUploads = await Promise.all(
        rows.map(async (row) => {
          if (!row.photoFile) return row;
          const uploaded = await uploadPhotoToSupabase(row.photoFile, inspectionId, row.id);
          return {
            ...row,
            photoName: uploaded.photoName,
            photoPath: uploaded.photoPath,
            photoFile: null,
          };
        })
      );

      const savedMetrics = calculateMetrics(rowsWithUploads);
      const persisted = toPersistedRows(rowsWithUploads);

      const res = await fetch(`${SUPABASE_URL}/rest/v1/inspections`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          id: inspectionId,
          company,
          plant,
          sector,
          auditor,
          inspection_date: inspectionDate,
          verification_type: verificationType,
          email: recipientEmail,
          summary: savedMetrics,
          findings: persisted.filter((row) => row.status === "no_cumple"),
          checklist: persisted,
        }),
      });

      if (!res.ok) throw new Error("No se pudo guardar la inspección en Supabase.");

      setRows(rowsWithUploads);
      await loadHistory();
      setSaveMessage("Inspección guardada correctamente en Supabase.");
      setSaveError("");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar la inspección.");
      setSaveMessage("");
    } finally {
      setIsSaving(false);
    }
  };

  const saveAndExport = async () => {
    await saveOnline();
    exportJson();
  };

  const openMailDraft = () => {
    setSaveMessage("");
    setSaveError("");
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
        <div className="app-header">
          <div className="app-header__copy">
            <h1 style={{ margin: 0, fontSize: 42 }}>Checklist de revisión edilicia</h1>
            <p style={{ marginTop: 8, color: "#475569" }}>
              Relevamiento de condiciones edilicias con checklist dinámico según tipo de verificación.
            </p>
          </div>
          <div className="app-header__actions">
            <button className="ui-button ui-button--header" style={buttonStyle} onClick={resetChecklist}>
              <RotateCcw size={16} /> Reiniciar
            </button>
            <button className="ui-button ui-button--header" style={buttonStyle} onClick={() => window.print()}>
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
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>
            <div style={reviewFieldStyle}>
              <label style={reviewLabelStyle}>Planta</label>
              <input
                className="review-control"
                style={reviewControlStyle}
                value={plant}
                onChange={(e) => setPlant(e.target.value)}
              />
            </div>
            <div style={reviewFieldStyle}>
              <label style={reviewLabelStyle}>Sector</label>
              <input
                className="review-control"
                style={reviewControlStyle}
                value={sector}
                onChange={(e) => setSector(e.target.value)}
              />
            </div>
            <div style={reviewFieldStyle}>
              <label style={reviewLabelStyle}>Auditor</label>
              <input
                className="review-control"
                style={reviewControlStyle}
                value={auditor}
                onChange={(e) => setAuditor(e.target.value)}
              />
            </div>
            <div style={reviewFieldStyle}>
              <label style={reviewLabelStyle}>Fecha</label>
              <input
                className="review-control"
                type="date"
                style={reviewControlStyle}
                value={inspectionDate}
                onChange={(e) => setInspectionDate(e.target.value)}
              />
            </div>
            <div style={reviewFieldStyle}>
              <label style={reviewLabelStyle}>Tipo de verificación</label>
              <select
                className="review-control"
                style={reviewControlStyle}
                value={verificationType}
                onChange={(e) => changeType(e.target.value as VerificationType)}
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
                onChange={(e) => setRecipientEmail(e.target.value)}
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
                onChange={(e) => setConfirmRecipientEmail(e.target.value)}
              />
              {confirmRecipientEmail.length > 0 && (
                <div
                  style={{
                    ...reviewFeedbackStyle,
                    color: emailMatch ? "#16a34a" : "#dc2626",
                  }}
                >
                  {emailMatch ? <Check size={13} style={{ verticalAlign: "middle", marginRight: 4 }} /> : <AlertCircle size={13} style={{ verticalAlign: "middle", marginRight: 4 }} />}
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
                  <div className="checklist-progress__fill" style={{ width: `${checklistProgress}%` }} />
                </div>
              </div>
              <div className="checklist-toolbar__controls">
                <input
                className="checklist-search"
                style={{ ...inputStyle, maxWidth: "none" }}
                placeholder="Buscar por categoría, punto, observación o responsable"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="checklist-toolbar__summary">
                Mostrando checklist de:{" "}
                <strong>{verificationType === "documental" ? "Revisión documental" : "Verificación en campo"}</strong>
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
                  Boolean(row.responsible.trim() || row.observation.trim() || row.photoName || row.photoPath);
                return (
                  <div
                    key={row.id}
                    className={`checklist-item-card ${rowCompleted ? "checklist-item-card--completed" : ""}`}
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
                        <div
                          style={{
                            display: "inline-block",
                            fontSize: 12,
                            padding: "4px 8px",
                            background: "#f1f5f9",
                            borderRadius: 999,
                            marginBottom: 8,
                          }}
                        >
                          {row.category}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>{row.item}</div>
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
                          onChange={(e) => handleRowFieldChange(row.id, "responsible", e.target.value)}
                        />
                      </div>

                      <div className="photo-field">
                        <label style={labelStyle}>Foto</label>
                        <div className={`photo-panel ${photoPreviewUrl ? "photo-panel--filled" : ""}`}>
                          {photoPreviewUrl ? (
                            <img
                              className="photo-panel__preview"
                              src={photoPreviewUrl}
                              alt={`Foto del item ${row.item}`}
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
                          onChange={(e) => handleRowFieldChange(row.id, "observation", e.target.value)}
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
                gap: 14,
              }}
            >
              {byCategory.map((cat) => (
                <div key={cat.category} style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 14 }}>
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
                  <div key={item.id} style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 14 }}>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{item.category}</div>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>{item.item}</div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
                        gap: 10,
                      }}
                    >
                      <div><strong>Observación:</strong> {item.observation || "—"}</div>
                      <div><strong>Responsable:</strong> {item.responsible || "—"}</div>
                      <div><strong>Foto:</strong> {item.photoName || "—"}</div>
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
              <button className="ui-button" style={buttonStyle} onClick={loadHistory}>
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

            {historyLoading ? (
              <div style={{ color: "#64748b" }}>Cargando historial...</div>
            ) : historyError ? (
              <div style={{ color: "#dc2626" }}>{historyError}</div>
            ) : filteredHistoryRows.length === 0 ? (
              <div style={{ color: "#64748b" }}>No hay inspecciones guardadas todavía.</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {filteredHistoryRows.map((item) => (
                  <div key={item.id} style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>
                          {item.verification_type === "documental" ? "Documental" : "En campo"}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>
                          {item.company || "Sin empresa"} · {item.plant || "Sin planta"}
                        </div>
                        <div style={{ color: "#475569" }}>
                          Sector: {item.sector || "—"} · Auditor: {item.auditor || "—"}
                        </div>
                      </div>
                      <div style={{ color: "#475569", fontSize: 14 }}>
                        <div>Fecha inspección: {item.inspection_date || "—"}</div>
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
                        <div style={{ fontWeight: 700, color: "#16a34a" }}>{item.summary?.cumple ?? 0}</div>
                      </div>
                      <div style={{ background: "#fef2f2", borderRadius: 10, padding: 10 }}>
                        <div style={{ fontSize: 12, color: "#64748b" }}>No cumple</div>
                        <div style={{ fontWeight: 700, color: "#dc2626" }}>{item.summary?.noCumple ?? 0}</div>
                      </div>
                      <div style={{ background: "#f1f5f9", borderRadius: 10, padding: 10 }}>
                        <div style={{ fontSize: 12, color: "#64748b" }}>No aplica</div>
                        <div style={{ fontWeight: 700 }}>{item.summary?.noAplica ?? 0}</div>
                      </div>
                    </div>

                    <div style={{ marginTop: 10, color: "#475569" }}>
                      Mail destinatario: {item.email || "—"} · Hallazgos guardados: {item.findings?.length ?? 0}
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <button className="ui-button" style={buttonStyle} onClick={() => setSelectedHistoryItem(item)}>
                        <Eye size={16} /> Ver detalle
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
                      {selectedHistoryItem.company || "Sin empresa"} · {selectedHistoryItem.plant || "Sin planta"} ·{" "}
                      {selectedHistoryItem.verification_type === "documental" ? "Documental" : "En campo"}
                    </div>
                  </div>
                  <button className="ui-button" style={buttonStyle} onClick={() => setSelectedHistoryItem(null)}>
                    Cerrar detalle
                  </button>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {(selectedHistoryItem.checklist || []).map((row) => (
                    <div
                      key={row.id}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 12,
                        padding: 12,
                        background: "#fff",
                      }}
                    >
                      <div style={{ fontSize: 12, color: "#64748b" }}>{row.category}</div>
                      <div style={{ fontWeight: 700 }}>{row.item}</div>
                      <div style={{ marginTop: 8 }}>
                        <strong>Resultado:</strong> {statusUi[row.status].label}
                      </div>
                      <div><strong>Observación:</strong> {row.observation || "—"}</div>
                      <div><strong>Responsable:</strong> {row.responsible || "—"}</div>
                      <div><strong>Foto:</strong> {row.photoName || "—"}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="section-card" style={box}>
          <h2 style={{ marginTop: 0 }}>Finalizar inspección</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="ui-button ui-button--primary" style={primaryButtonStyle} onClick={saveOnline} disabled={isSaving}>
              <Save size={16} /> {isSaving ? "Guardando..." : "Guardar online"}
            </button>
            <button className="ui-button" style={buttonStyle} onClick={saveAndExport} disabled={isSaving}>
              <Download size={16} /> Guardar y exportar
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
