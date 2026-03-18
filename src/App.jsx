import { useState, useRef, useEffect } from "react";
import { supabase } from "./lib/supabase";

const CATEGORIES = ["Migración", "Impositivo", "Laboral", "Contactos", "General"];
const CAT_COLORS = { "Migración": "#16a34a", "Impositivo": "#d97706", "Laboral": "#2563eb", "Contactos": "#7c3aed", "General": "#64748b" };
const CAT_ICONS = { "Migración": "🛂", "Impositivo": "💰", "Laboral": "⚖️", "Contactos": "📞", "General": "📋" };
const GLOBAL_COUNTRY = "🌐 Global / Multi-país";

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function ExpiryBadge({ dateStr }) {
  const days = daysUntil(dateStr);
  if (days === null) return null;
  if (days < 0) return <span style={{ background: "#ef444422", color: "#ef4444", borderRadius: 4, padding: "1px 7px", fontSize: 11, fontWeight: "bold" }}>⛔ Vencida</span>;
  if (days <= 30) return <span style={{ background: "#f9731622", color: "#f97316", borderRadius: 4, padding: "1px 7px", fontSize: 11, fontWeight: "bold" }}>⚠️ Vence en {days}d</span>;
  if (days <= 90) return <span style={{ background: "#eab30822", color: "#eab308", borderRadius: 4, padding: "1px 7px", fontSize: 11, fontWeight: "bold" }}>🕐 {days}d restantes</span>;
  return <span style={{ background: "#16a34a22", color: "#16a34a", borderRadius: 4, padding: "1px 7px", fontSize: 11 }}>✅ Vigente</span>;
}

export default function App() {
  const [view, setView] = useState("chat");
  const [entries, setEntries] = useState([]);
  const [history, setHistory] = useState([]);
  const [messages, setMessages] = useState([
    { role: "assistant", text: "¡Hola! Soy tu asistente de movilidades internacionales. Podés hacerme una pregunta libre o usar el modo 🧳 Caso Completo para analizar una situación específica de un empleado. ¿En qué te ayudo?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [addForm, setAddForm] = useState({ country: "", category: "Migración", content: "", author: "", expiryDate: "" });
  const [addStatus, setAddStatus] = useState("");
  const [filterCountry, setFilterCountry] = useState("Todos");
  const [filterCat, setFilterCat] = useState("Todas");
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [caseForm, setCaseForm] = useState({ employeeCountry: "", destCountry: "", duration: "", contractType: "", regime: "", notes: "" });
  const [caseLoading, setCaseLoading] = useState(false);
  const [caseResult, setCaseResult] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadEntries();
    loadHistoryFromDB();
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function loadEntries() {
    const { data } = await supabase
      .from("knowledge_entries")
      .select("*")
      .order("created_at", { ascending: true });
    if (data) setEntries(data);
  }

  async function loadHistoryFromDB() {
    const { data } = await supabase
      .from("chat_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setHistory(data.map(item => ({
      id: item.id,
      type: item.type,
      question: item.question,
      answer: item.answer,
      case: item.case_data,
      date: new Date(item.created_at).toLocaleDateString("es-AR"),
    })));
  }

  // Build nested structure from flat Supabase rows
  const db = { countries: {} };
  for (const entry of entries) {
    if (!db.countries[entry.country]) db.countries[entry.country] = {};
    if (!db.countries[entry.country][entry.category]) db.countries[entry.country][entry.category] = [];
    db.countries[entry.country][entry.category].push({
      id: entry.id,
      content: entry.content,
      source: entry.source,
      author: entry.author,
      date: new Date(entry.created_at).toLocaleDateString("es-AR"),
      expiryDate: entry.expiry_date,
    });
  }

  const allCountries = Object.keys(db.countries).sort();

  const alertCount = allCountries.reduce((acc, country) => {
    CATEGORIES.forEach(cat => {
      (db.countries[country]?.[cat] || []).forEach(e => {
        const d = daysUntil(e.expiryDate);
        if (d !== null && d <= 30) acc++;
      });
    });
    return acc;
  }, 0);

  function buildContext() {
    if (allCountries.length === 0) return "No hay información cargada en la base de conocimiento aún.";
    let ctx = "BASE DE CONOCIMIENTO — MOVILIDADES INTERNACIONALES:\n\n";
    // Primero la info global/multi-país
    if (db.countries[GLOBAL_COUNTRY]) {
      ctx += `=== INFORMACIÓN GLOBAL / MULTI-PAÍS (aplica a todos los casos) ===\n`;
      for (const cat of CATEGORIES) {
        const ents = db.countries[GLOBAL_COUNTRY]?.[cat] || [];
        if (ents.length > 0) {
          ctx += `\n[${cat}]\n`;
          ents.forEach(e => {
            const expiry = e.expiryDate ? ` [Vigencia hasta: ${e.expiryDate}]` : "";
            ctx += `• ${e.content}${expiry}\n  (Fuente: ${e.source || "manual"}, ${e.date})\n`;
          });
        }
      }
      ctx += "\n";
    }
    // Después la info por país
    for (const country of allCountries.filter(c => c !== GLOBAL_COUNTRY)) {
      ctx += `=== ${country.toUpperCase()} ===\n`;
      for (const cat of CATEGORIES) {
        const ents = db.countries[country]?.[cat] || [];
        if (ents.length > 0) {
          ctx += `\n[${cat}]\n`;
          ents.forEach(e => {
            const expiry = e.expiryDate ? ` [Vigencia hasta: ${e.expiryDate}]` : "";
            ctx += `• ${e.content}${expiry}\n  (Fuente: ${e.source || "manual"}, ${e.date})\n`;
          });
        }
      }
      ctx += "\n";
    }
    return ctx;
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const userMsg = { role: "user", text };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    const context = buildContext();
    const systemPrompt = `Sos un asistente experto en movilidades internacionales. Respondé ÚNICAMENTE con la información de la base de conocimiento. Respondé en español, de forma clara y estructurada. Si no hay info, decilo y sugerí cargarla. Nunca inventes datos.\n\n${context}`;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: systemPrompt,
          messages: [
            ...messages.slice(1).map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text })),
            { role: "user", content: text }
          ]
        })
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || `Error API: ${data.error?.message || data.error?.type || JSON.stringify(data)}`;
      setMessages(prev => [...prev, { role: "assistant", text: reply }]);
      await supabase.from("chat_history").insert([{ type: "free", question: text, answer: reply }]);
      await loadHistoryFromDB();
    } catch {
      setMessages(prev => [...prev, { role: "assistant", text: "Error al conectar. Intentá de nuevo." }]);
    }
    setLoading(false);
  }

  async function runCase() {
    const { employeeCountry, destCountry, duration, contractType } = caseForm;
    if (!destCountry.trim()) return;
    setCaseLoading(true);
    setCaseResult(null);
    const context = buildContext();
    const prompt = `Analizá el siguiente caso de movilidad internacional y generá un informe completo cruzando migración, impuestos y derecho laboral.

CASO:
- País de origen del empleado: ${employeeCountry || "No especificado"}
- País de destino: ${destCountry}
- Duración de la asignación: ${duration || "No especificada"}
- Tipo de contrato: ${contractType || "No especificado"}
- Régimen de trabajo: ${caseForm.regime || "No especificado"}
- Notas adicionales: ${caseForm.notes || "Ninguna"}

BASE DE CONOCIMIENTO:
${context}

Generá un informe estructurado con estas secciones:
1. 🛂 MIGRACIÓN: visas, permisos, documentación necesaria
2. 💰 IMPOSITIVO: obligaciones fiscales, retenciones, convenios
3. ⚖️ LABORAL: contrato, jornada, beneficios obligatorios
4. 📞 CONTACTOS RELEVANTES: personas de referencia disponibles
5. ⚠️ ALERTAS Y PUNTOS CRÍTICOS: riesgos o aspectos a verificar
6. ✅ PRÓXIMOS PASOS RECOMENDADOS

Si falta información en algún área, indicalo claramente. Sé específico y práctico.`;

    try {
      const res = await fetch("/api/case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      const result = data.content?.[0]?.text || "No se pudo generar el análisis.";
      setCaseResult(result);
      await supabase.from("chat_history").insert([{
        type: "case",
        answer: result,
        case_data: { ...caseForm }
      }]);
      await loadHistoryFromDB();
    } catch {
      setCaseResult("Error al generar el análisis. Intentá de nuevo.");
    }
    setCaseLoading(false);
  }

  async function handleAddEntry() {
    const { country, category, content } = addForm;
    if (!country.trim() || !content.trim()) { setAddStatus("error"); setTimeout(() => setAddStatus(""), 2000); return; }
    const { error } = await supabase.from("knowledge_entries").insert([{
      country: country.trim(),
      category,
      content: content.trim(),
      source: "manual",
      author: addForm.author.trim() || "Equipo",
      expiry_date: addForm.expiryDate || null,
    }]);
    if (!error) {
      await loadEntries();
      setAddForm(f => ({ ...f, content: "", expiryDate: "" }));
      setAddStatus("ok");
    } else {
      setAddStatus("error");
    }
    setTimeout(() => setAddStatus(""), 2000);
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const { country, category } = addForm;
    if (!country.trim()) { setAddStatus("error"); setTimeout(() => setAddStatus(""), 2000); return; }
    setAddStatus("loading");
    try {
      let extractedText = "";
      if (file.type === "application/pdf") {
        const b64 = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = ev => res(ev.target.result.split(",")[1]);
          r.onerror = rej;
          r.readAsDataURL(file);
        });
        const resp = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdf: b64 })
        });
        const d = await resp.json();
        extractedText = d.text || "";
      } else {
        extractedText = await file.text();
      }
      await supabase.from("knowledge_entries").insert([{
        country: country.trim(),
        category,
        content: extractedText.trim(),
        source: file.name,
        author: addForm.author.trim() || "Equipo",
        expiry_date: addForm.expiryDate || null,
      }]);
      await loadEntries();
      setAddStatus("ok");
    } catch {
      setAddStatus("error");
    }
    setTimeout(() => setAddStatus(""), 3000);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function deleteEntry(id) {
    await supabase.from("knowledge_entries").delete().eq("id", id);
    await loadEntries();
  }

  const S = {
    input: { background: "#0f1117", border: "1px solid #2a2f3e", borderRadius: 8, padding: "9px 12px", color: "#e8e0d0", fontSize: 14, fontFamily: "inherit", width: "100%", boxSizing: "border-box" },
    label: { fontSize: 12, color: "#7a8090", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" },
    card: { background: "#1a1f2e", border: "1px solid #2a2f3e", borderRadius: 12, padding: 20 },
  };

  const filteredCountries = allCountries.filter(c => {
    if (filterCountry !== "Todos" && c !== filterCountry) return false;
    if (alertsOnly) return CATEGORIES.some(cat => (db.countries[c]?.[cat] || []).some(e => { const d = daysUntil(e.expiryDate); return d !== null && d <= 30; }));
    return true;
  });

  const navItems = [
    { id: "chat", label: "💬 Consultar" },
    { id: "case", label: "🧳 Caso Completo" },
    { id: "knowledge", label: "🗂️ Gestionar" },
    { id: "history", label: `📚 Historial${history.length ? ` (${history.length})` : ""}` },
  ];

  return (
    <div style={{ fontFamily: "'Georgia', serif", background: "#0f1117", minHeight: "100vh", color: "#e8e0d0", display: "flex", flexDirection: "column" }}>
      {/* HEADER */}
      <div style={{ background: "linear-gradient(135deg,#1a1f2e,#0f1117)", borderBottom: "1px solid #2a2f3e", padding: "0 24px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <img src="data:image/png;base64,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" alt="KPMG" style={{ height: 32 }} />
            <div style={{ width: 1, height: 32, background: "#2a2f3e" }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: "bold", color: "#f0ebe0" }}>Movilidades Internacionales</div>
              <div style={{ fontSize: 10, color: "#7a8090", letterSpacing: "0.08em", textTransform: "uppercase" }}>Base de conocimiento · Equipo compartido</div>
            </div>
            {alertCount > 0 && (
              <div style={{ background: "#ef444433", color: "#ef4444", border: "1px solid #ef444466", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: "bold", marginLeft: 8, cursor: "pointer" }} onClick={() => { setView("knowledge"); setAlertsOnly(true); }}>
                ⚠️ {alertCount} alerta{alertCount > 1 ? "s" : ""}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 2, background: "#1a1f2e", borderRadius: 10, padding: 3, flexWrap: "wrap" }}>
            {navItems.map(({ id, label }) => (
              <button key={id} onClick={() => setView(id)} style={{ padding: "6px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, fontFamily: "inherit", background: view === id ? "#2a3550" : "transparent", color: view === id ? "#c8b88a" : "#7a8090", transition: "all 0.2s", whiteSpace: "nowrap" }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, maxWidth: 960, margin: "0 auto", width: "100%", padding: "20px 24px 0" }}>
        {/* CHAT */}
        {view === "chat" && (
          <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 130px)" }}>
            {allCountries.length === 0 && (
              <div style={{ background: "#1a1f2e", border: "1px solid #c8b88a33", borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: 13, color: "#c8b88a" }}>
                💡 Aún no hay información cargada. Andá a <b>Gestionar</b> para agregar datos de países.
              </div>
            )}
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, paddingBottom: 14 }}>
              {messages.map((msg, i) => (
                <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 10 }}>
                  {msg.role === "assistant" && <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#2a3550", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0, marginTop: 4 }}>✈️</div>}
                  <div style={{ maxWidth: "72%", padding: "11px 15px", borderRadius: msg.role === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px", background: msg.role === "user" ? "#2a3550" : "#1a1f2e", border: `1px solid ${msg.role === "user" ? "#3a4a6a" : "#2a2f3e"}`, fontSize: 14, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#2a3550", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>✈️</div>
                  <div style={{ background: "#1a1f2e", border: "1px solid #2a2f3e", borderRadius: "4px 16px 16px 16px", padding: "11px 16px", color: "#c8b88a", fontSize: 18 }}>●●●</div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div style={{ display: "flex", gap: 10, paddingBottom: 20, background: "#0f1117" }}>
              <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder="Preguntá sobre normativas, visas, impuestos... (Enter para enviar)" rows={2} style={{ ...S.input, flex: 1, resize: "none" }} />
              <button onClick={sendMessage} disabled={!input.trim() || loading} style={{ width: 46, background: input.trim() && !loading ? "#c8b88a" : "#2a2f3e", border: "none", borderRadius: 10, cursor: input.trim() && !loading ? "pointer" : "default", color: input.trim() && !loading ? "#0f1117" : "#4a5060", fontSize: 18, transition: "all 0.2s" }}>➤</button>
            </div>
          </div>
        )}

        {/* CASO COMPLETO */}
        {view === "case" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 40 }}>
            <div style={S.card}>
              <div style={{ fontSize: 15, fontWeight: "bold", color: "#c8b88a", marginBottom: 4 }}>🧳 Análisis de Caso Completo</div>
              <div style={{ fontSize: 13, color: "#7a8090", marginBottom: 18 }}>Completá los datos del caso y la IA cruzará automáticamente migración, impuestos y derecho laboral.</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={S.label}>País origen del empleado</label>
                  <input value={caseForm.employeeCountry} onChange={e => setCaseForm(f => ({ ...f, employeeCountry: e.target.value }))} placeholder="Ej: Argentina" style={S.input} />
                </div>
                <div>
                  <label style={S.label}>País de destino *</label>
                  <input list="case-country-list" value={caseForm.destCountry} onChange={e => setCaseForm(f => ({ ...f, destCountry: e.target.value }))} placeholder="Ej: Alemania" style={S.input} />
                  <datalist id="case-country-list">{allCountries.map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div>
                  <label style={S.label}>Duración</label>
                  <input value={caseForm.duration} onChange={e => setCaseForm(f => ({ ...f, duration: e.target.value }))} placeholder="Ej: 6 meses" style={S.input} />
                </div>
                <div>
                  <label style={S.label}>Tipo de contrato</label>
                  <select value={caseForm.contractType} onChange={e => setCaseForm(f => ({ ...f, contractType: e.target.value }))} style={S.input}>
                    <option value="">Seleccionar...</option>
                    <option>Relación de dependencia local</option>
                    <option>Relación de dependencia en origen</option>
                    <option>Contrato dual</option>
                    <option>Secondment / Asignación</option>
                    <option>Freelance / Independiente</option>
                  </select>
                </div>
                <div>
                  <label style={S.label}>Régimen de trabajo</label>
                  <select value={caseForm.regime} onChange={e => setCaseForm(f => ({ ...f, regime: e.target.value }))} style={S.input}>
                    <option value="">Seleccionar...</option>
                    <option>Presencial en destino</option>
                    <option>Remoto desde destino</option>
                    <option>Híbrido</option>
                  </select>
                </div>
                <div>
                  <label style={S.label}>Notas adicionales</label>
                  <input value={caseForm.notes} onChange={e => setCaseForm(f => ({ ...f, notes: e.target.value }))} placeholder="Familia, sector, nivel..." style={S.input} />
                </div>
              </div>
              <button onClick={runCase} disabled={!caseForm.destCountry || caseLoading} style={{ background: caseForm.destCountry && !caseLoading ? "#c8b88a" : "#2a2f3e", color: caseForm.destCountry && !caseLoading ? "#0f1117" : "#4a5060", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: "bold", cursor: caseForm.destCountry && !caseLoading ? "pointer" : "default", fontFamily: "inherit" }}>
                {caseLoading ? "⏳ Analizando caso..." : "🔍 Generar análisis completo"}
              </button>
            </div>
            {caseResult && (
              <div style={{ ...S.card, borderColor: "#c8b88a44" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: "bold", color: "#c8b88a" }}>📋 Análisis — {caseForm.destCountry}{caseForm.employeeCountry ? ` (desde ${caseForm.employeeCountry})` : ""}</div>
                  <span style={{ fontSize: 11, color: "#4a5060" }}>{new Date().toLocaleDateString("es-AR")}</span>
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.75, whiteSpace: "pre-wrap", color: "#d8d0c0" }}>{caseResult}</div>
              </div>
            )}
          </div>
        )}

        {/* GESTIONAR */}
        {view === "knowledge" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 40 }}>
            <div style={S.card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ fontSize: 15, fontWeight: "bold", color: "#c8b88a" }}>➕ Agregar información</div>
                <div style={{ fontSize: 11, background: "#16a34a22", color: "#16a34a", border: "1px solid #16a34a44", borderRadius: 20, padding: "3px 10px" }}>🌐 Compartido con el equipo</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={S.label}>País</label>
                  <input list="kb-country-list" value={addForm.country} onChange={e => setAddForm(f => ({ ...f, country: e.target.value }))} placeholder="Ej: Alemania" style={S.input} />
                  <datalist id="kb-country-list">
                    <option value={GLOBAL_COUNTRY} />
                    {allCountries.filter(c => c !== GLOBAL_COUNTRY).map(c => <option key={c} value={c} />)}
                  </datalist>
                  <button type="button" onClick={() => setAddForm(f => ({ ...f, country: GLOBAL_COUNTRY }))} style={{ marginTop: 6, background: addForm.country === GLOBAL_COUNTRY ? "#c8b88a" : "#2a3550", border: "1px solid #c8b88a55", borderRadius: 6, padding: "4px 12px", color: addForm.country === GLOBAL_COUNTRY ? "#0f1117" : "#c8b88a", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: "bold" }}>
                    🌐 Global / Multi-país
                  </button>
                </div>
                <div>
                  <label style={S.label}>Categoría</label>
                  <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} style={S.input}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{CAT_ICONS[c]} {c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Tu nombre</label>
                  <input value={addForm.author} onChange={e => setAddForm(f => ({ ...f, author: e.target.value }))} placeholder="Ej: María" style={S.input} />
                </div>
              </div>
              <textarea value={addForm.content} onChange={e => setAddForm(f => ({ ...f, content: e.target.value }))} placeholder="Pegá aquí la información: normativas, notas, correos, datos importantes..." rows={4} style={{ ...S.input, resize: "vertical", marginBottom: 12 }} />
              <div style={{ marginBottom: 14 }}>
                <label style={S.label}>⏰ Fecha de vencimiento <span style={{ color: "#4a5060", fontWeight: "normal", textTransform: "none", letterSpacing: 0 }}>(opcional — genera alertas automáticas)</span></label>
                <input type="date" value={addForm.expiryDate} onChange={e => setAddForm(f => ({ ...f, expiryDate: e.target.value }))} style={{ ...S.input, width: 200 }} />
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button onClick={handleAddEntry} style={{ background: "#c8b88a", color: "#0f1117", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 14, fontWeight: "bold", cursor: "pointer", fontFamily: "inherit" }}>Guardar texto</button>
                <button onClick={() => fileInputRef.current?.click()} style={{ background: "#2a3550", color: "#c8b88a", border: "1px solid #3a4a6a", borderRadius: 8, padding: "9px 20px", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>📎 Subir archivo</button>
                <input ref={fileInputRef} type="file" accept=".txt,.pdf,.md,.csv" onChange={handleFile} style={{ display: "none" }} />
                {addStatus === "ok" && <span style={{ color: "#16a34a", fontSize: 13 }}>✅ Guardado</span>}
                {addStatus === "error" && <span style={{ color: "#ef4444", fontSize: 13 }}>❌ Completá país y contenido</span>}
                {addStatus === "loading" && <span style={{ color: "#c8b88a", fontSize: 13 }}>⏳ Procesando archivo...</span>}
              </div>
            </div>

            {allCountries.length > 0 && (
              <>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: "#7a8090", textTransform: "uppercase", letterSpacing: "0.06em" }}>Filtrar:</span>
                  <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)} style={{ background: "#1a1f2e", border: "1px solid #2a2f3e", borderRadius: 8, padding: "6px 12px", color: "#e8e0d0", fontSize: 13, fontFamily: "inherit" }}>
                    <option value="Todos">Todos los países</option>
                    {allCountries.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ background: "#1a1f2e", border: "1px solid #2a2f3e", borderRadius: 8, padding: "6px 12px", color: "#e8e0d0", fontSize: 13, fontFamily: "inherit" }}>
                    <option value="Todas">Todas las categorías</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{CAT_ICONS[c]} {c}</option>)}
                  </select>
                  {alertCount > 0 && (
                    <button onClick={() => setAlertsOnly(a => !a)} style={{ background: alertsOnly ? "#ef444433" : "#1a1f2e", border: `1px solid ${alertsOnly ? "#ef4444" : "#2a2f3e"}`, borderRadius: 8, padding: "6px 12px", color: alertsOnly ? "#ef4444" : "#7a8090", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                      ⚠️ Solo alertas ({alertCount})
                    </button>
                  )}
                  <span style={{ fontSize: 12, color: "#4a5060", marginLeft: "auto" }}>{allCountries.length} país/es</span>
                </div>
                {filteredCountries.map(country => (
                  <div key={country} style={{ background: "#1a1f2e", border: "1px solid #2a2f3e", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ background: "#2a2f3e", padding: "11px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 18 }}>🌍</span>
                      <span style={{ fontWeight: "bold", fontSize: 15, color: "#f0ebe0" }}>{country}</span>
                      <span style={{ fontSize: 12, color: "#7a8090", marginLeft: "auto" }}>{CATEGORIES.filter(c => (db.countries[country]?.[c] || []).length > 0).length} categorías</span>
                    </div>
                    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                      {CATEGORIES.filter(cat => filterCat === "Todas" || cat === filterCat).map(cat => {
                        const ents = db.countries[country]?.[cat] || [];
                        if (ents.length === 0) return null;
                        return (
                          <div key={cat}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                              <span style={{ background: CAT_COLORS[cat] + "33", color: CAT_COLORS[cat], borderRadius: 6, padding: "2px 9px", fontSize: 12, fontWeight: "bold" }}>{CAT_ICONS[cat]} {cat}</span>
                              <span style={{ fontSize: 11, color: "#4a5060" }}>{ents.length} entrada{ents.length > 1 ? "s" : ""}</span>
                            </div>
                            {ents.map((entry) => {
                              const days = daysUntil(entry.expiryDate);
                              const isAlert = days !== null && days <= 30;
                              return (
                                <div key={entry.id} style={{ background: isAlert ? "#ef444408" : "#0f1117", border: `1px solid ${isAlert ? "#ef444433" : "#2a2f3e"}`, borderRadius: 8, padding: "9px 12px", marginBottom: 5, display: "flex", gap: 10 }}>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, color: "#c8c0b0", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{entry.content.length > 250 ? entry.content.slice(0, 250) + "..." : entry.content}</div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                                      <span style={{ fontSize: 11, color: "#4a5060" }}>📎 {entry.source} · 👤 {entry.author || "Equipo"} · {entry.date}</span>
                                      {entry.expiryDate && <ExpiryBadge dateStr={entry.expiryDate} />}
                                    </div>
                                  </div>
                                  <button onClick={() => deleteEntry(entry.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#4a5060", fontSize: 15, alignSelf: "flex-start", padding: "2px 4px" }}>✕</button>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}
            {allCountries.length === 0 && (
              <div style={{ textAlign: "center", padding: "50px 20px", color: "#4a5060" }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>🗺️</div>
                <div style={{ fontSize: 15, color: "#7a8090", marginBottom: 6 }}>Base de conocimiento vacía</div>
                <div style={{ fontSize: 13 }}>Usá el formulario de arriba para agregar el primer país</div>
              </div>
            )}
          </div>
        )}

        {/* HISTORIAL */}
        {view === "history" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 40 }}>
            {history.length === 0 ? (
              <div style={{ textAlign: "center", padding: "50px 20px", color: "#4a5060" }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>📚</div>
                <div style={{ fontSize: 15, color: "#7a8090" }}>Aún no hay consultas guardadas</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>Las consultas del chat y los casos analizados aparecerán acá</div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "#7a8090" }}>{history.length} consulta{history.length > 1 ? "s" : ""} guardada{history.length > 1 ? "s" : ""}</span>
                  <button onClick={async () => { await supabase.from("chat_history").delete().neq("id", "00000000-0000-0000-0000-000000000000"); setHistory([]); }} style={{ background: "none", border: "1px solid #2a2f3e", borderRadius: 6, padding: "4px 12px", color: "#7a8090", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Limpiar historial</button>
                </div>
                {history.map((item) => (
                  <div key={item.id} style={{ background: "#1a1f2e", border: "1px solid #2a2f3e", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ background: "#2a2f3e", padding: "9px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 13 }}>{item.type === "case" ? "🧳" : "💬"}</span>
                      <span style={{ fontSize: 13, fontWeight: "bold", color: "#c8b88a" }}>
                        {item.type === "case" ? `Caso: ${item.case?.destCountry || ""}${item.case?.employeeCountry ? ` (desde ${item.case.employeeCountry})` : ""}` : (item.question?.slice(0, 70) + (item.question?.length > 70 ? "..." : ""))}
                      </span>
                      <span style={{ fontSize: 11, color: "#4a5060", marginLeft: "auto" }}>{item.date}</span>
                    </div>
                    <div style={{ padding: "12px 14px" }}>
                      {item.type === "case" && item.case && (
                        <div style={{ fontSize: 12, color: "#7a8090", marginBottom: 8, display: "flex", gap: 12, flexWrap: "wrap" }}>
                          {item.case.duration && <span>⏱ {item.case.duration}</span>}
                          {item.case.contractType && <span>📝 {item.case.contractType}</span>}
                          {item.case.regime && <span>💼 {item.case.regime}</span>}
                        </div>
                      )}
                      <div style={{ fontSize: 13, color: "#c8c0b0", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                        {item.answer?.length > 450 ? item.answer.slice(0, 450) + "..." : item.answer}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #0f1117; }
        ::-webkit-scrollbar-thumb { background: #2a2f3e; border-radius: 3px; }
        textarea:focus, input:focus, select:focus { outline: 1px solid #c8b88a44 !important; border-color: #c8b88a66 !important; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.6); }
        @media (max-width: 600px) {
          div[style*="maxWidth: 960"] { padding: 12px 12px 0 !important; }
        }
      `}</style>
    </div>
  );
}
