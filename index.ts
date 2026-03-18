import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

console.log("Bot v22 — debug logging + improved tool-response handling");
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// === NOTION ===
const NOTION_DB = {
  clients: "8e3742ca-3bfb-47e3-b534-e5a348b4c5a7",
  projects: "303af9ae-354a-8190-b01c-d72af40e6965",
  tasks: "303af9ae-354a-81ba-967e-c86933f57551",
  meeting_notes: "47680d8f-71d9-47e2-a8cf-fe2d0844615b",
  deliverables: "c5032c12-65c4-443f-9884-76c470f1e2e3",
  resources: "303af9ae-354a-81f0-ab25-f39f6e5f531c",
};
const PARA_PAGE_ID = "303af9ae-354a-80f2-99c9-f6714c6f9219";

// v17: Use Notion API url field directly (correct slug format)

async function notionReq(endpoint: string, method = "GET", body?: unknown) {
  const res = await fetch(`https://api.notion.com/v1${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${NOTION_API_KEY}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

async function searchClients(query: string): Promise<string> {
  const data = await notionReq(`/databases/${NOTION_DB.clients}/query`, "POST", { filter: { property: "Client Name", title: { contains: query } } });
  if (!data.results?.length) return `Không tìm thấy client "${query}".`;
  let r = "";
  for (const page of data.results) {
    const p = page.properties;
    r += `\n📋 *${p["Client Name"]?.title?.[0]?.plain_text || "N/A"}*\n`;
    r += `├ Status: ${p["Status"]?.select?.name || "N/A"} | Niche: ${p["Niche"]?.select?.name || "N/A"}\n`;
    r += `├ Email: ${p["Owner Email"]?.email || "N/A"} | Phone: ${p["Owner Phone"]?.phone_number || "N/A"}\n`;
    r += `└ 🔗 ${page.url}\n`;
  }
  return r;
}

async function listAllClients(): Promise<string> {
  const data = await notionReq(`/databases/${NOTION_DB.clients}/query`, "POST", { sorts: [{ property: "Client Name", direction: "ascending" }] });
  if (!data.results?.length) return "Chưa có client.";
  let r = "📋 *Clients:*\n";
  for (const page of data.results) {
    const p = page.properties;
    const name = p["Client Name"]?.title?.[0]?.plain_text || "N/A";
    const status = p["Status"]?.select?.name || "";
    const e = status === "Active" ? "🟢" : status === "Onboarding" ? "🟡" : status === "Prospect" ? "⚪" : "🔴";
    r += `${e} *${name}* — ${status}\n`;
  }
  return r;
}

async function listProjects(clientFilter?: string): Promise<string> {
  const body: any = { sorts: [{ property: "Name", direction: "ascending" }] };
  if (clientFilter) body.filter = { property: "Client Name", select: { equals: clientFilter } };
  const data = await notionReq(`/databases/${NOTION_DB.projects}/query`, "POST", body);
  if (!data.results?.length) return "Không có project.";
  let r = "🏗️ *Projects:*\n";
  for (const page of data.results) {
    const p = page.properties;
    r += `• *${p["Name"]?.title?.[0]?.plain_text || "N/A"}* — ${p["Client Name"]?.select?.name || ""}\n`;
    if (p["PGS Current Phase"]?.select?.name) r += `   └ ${p["PGS Current Phase"].select.name}\n`;
  }
  return r;
}

// v13: Returns url after saving
async function addClientNote(clientName: string, note: string): Promise<string> {
  const data = await notionReq(`/databases/${NOTION_DB.clients}/query`, "POST", { filter: { property: "Client Name", title: { contains: clientName } } });
  if (!data.results?.length) return `Không tìm thấy "${clientName}".`;
  const existing = data.results[0].properties["Notes"]?.rich_text?.[0]?.plain_text || "";
  const ts = new Date().toLocaleDateString("vi-VN");
  await notionReq(`/pages/${data.results[0].id}`, "PATCH", { properties: { Notes: { rich_text: [{ text: { content: (existing ? existing + "\n" : "") + `[${ts}] ${note}`.substring(0, 2000) } }] } } });
  const url = data.results[0].url || "";
  return `✅ Ghi chú cho *${data.results[0].properties["Client Name"]?.title?.[0]?.plain_text}*\n🔗 ${url}`;
}

// v13: All create functions return { result, url }
async function addTask(name: string, phase?: string, priority?: string): Promise<{ result: string; url: string }> {
  const props: any = { Name: { title: [{ text: { content: name } }] } };
  if (phase) props["PGS Phase"] = { select: { name: phase } };
  if (priority) props.Priority = { select: { name: priority } };
  const res = await notionReq(`/pages`, "POST", { parent: { database_id: NOTION_DB.tasks }, properties: props });
  const url = res.url || "";
  return { result: res.id ? `✅ Task: *${name}*${phase ? " | " + phase : ""}` : "❌ Lỗi", url };
}

async function addNewClient(name: string, niche?: string, email?: string, phone?: string): Promise<string> {
  const props: any = { "Client Name": { title: [{ text: { content: name } }] }, Status: { select: { name: "Prospect" } } };
  if (niche) props.Niche = { select: { name: niche } };
  if (email) props["Owner Email"] = { email };
  if (phone) props["Owner Phone"] = { phone_number: phone };
  const res = await notionReq(`/pages`, "POST", { parent: { database_id: NOTION_DB.clients }, properties: props });
  const url = res.url || "";
  return res.id ? `✅ Client mới: *${name}*\n🔗 ${url}` : "❌ Lỗi";
}

// === PARA FUNCTIONS — v13: all return { result, url } ===
async function addMeetingNote(title: string, client?: string, meetingType?: string, pgsPhase?: string, meetingDate?: string): Promise<{ result: string; url: string }> {
  const props: any = { Title: { title: [{ text: { content: title } }] } };
  // Client is a relation field — resolve page_id from client name
  if (client) {
    const clientData = await notionReq(`/databases/${NOTION_DB.clients}/query`, "POST", { filter: { property: "Client Name", title: { contains: client } } });
    if (clientData.results?.length) props["Client"] = { relation: [{ id: clientData.results[0].id }] };
  }
  if (meetingType) props["Meeting Type"] = { select: { name: meetingType } };
  if (pgsPhase) props["PGS Phase"] = { select: { name: pgsPhase } };
  if (meetingDate) props["Meeting Date"] = { date: { start: meetingDate } };
  try {
    const res = await notionReq("/pages", "POST", { parent: { database_id: NOTION_DB.meeting_notes }, properties: props });
    const url = res.url || "";
    return { result: res.id ? `✅ Meeting Note: *${title}*${client ? " | " + client : ""}` : `❌ Lỗi: ${JSON.stringify(res.message || "").substring(0, 100)}`, url };
  } catch (e) { return { result: `❌ Lỗi: ${String(e).substring(0, 100)}`, url: "" }; }
}

async function addDeliverable(name: string, type?: string, client?: string, pgsPhase?: string, link?: string): Promise<{ result: string; url: string }> {
  const props: any = { Name: { title: [{ text: { content: name } }] } };
  if (type) props["Type"] = { select: { name: type } };
  if (client) props["Client"] = { select: { name: client } };
  if (pgsPhase) props["PGS Phase"] = { select: { name: pgsPhase } };
  if (link) props["Link"] = { url: link };
  props["Delivery Date"] = { date: { start: new Date().toISOString().split("T")[0] } };
  try {
    const res = await notionReq("/pages", "POST", { parent: { database_id: NOTION_DB.deliverables }, properties: props });
    const url = res.url || "";
    return { result: res.id ? `✅ Deliverable: *${name}*${type ? " | " + type : ""}` : `❌ Lỗi: ${JSON.stringify(res.message || "").substring(0, 100)}`, url };
  } catch (e) { return { result: `❌ Lỗi: ${String(e).substring(0, 100)}`, url: "" }; }
}

async function addResource(title: string, content: string, sourceUrl?: string): Promise<{ result: string; url: string }> {
  try {
    const props: any = { Name: { title: [{ text: { content: title } }] } };
    if (sourceUrl) props["Link"] = { url: sourceUrl };
    const children: any[] = [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: content.substring(0, 2000) } }] } }];
    const res = await notionReq("/pages", "POST", { parent: { database_id: NOTION_DB.resources }, properties: props, children });
    const url = res.url || "";
    return { result: res.id ? `✅ Resource: *${title}*` : `❌ Lỗi: ${JSON.stringify(res.message || "").substring(0, 100)}`, url };
  } catch (e) { return { result: `❌ Lỗi: ${String(e).substring(0, 100)}`, url: "" }; }
}

async function addProject(name: string, client?: string, pgsPhase?: string): Promise<{ result: string; url: string }> {
  const props: any = { Name: { title: [{ text: { content: name } }] } };
  if (client) props["Client Name"] = { select: { name: client } };
  if (pgsPhase) props["PGS Current Phase"] = { select: { name: pgsPhase } };
  try {
    const res = await notionReq("/pages", "POST", { parent: { database_id: NOTION_DB.projects }, properties: props });
    const url = res.url || "";
    return { result: res.id ? `✅ Project: *${name}*${client ? " | " + client : ""}` : `❌ Lỗi: ${JSON.stringify(res.message || "").substring(0, 100)}`, url };
  } catch (e) { return { result: `❌ Lỗi: ${String(e).substring(0, 100)}`, url: "" }; }
}

// === NOTEBOOKLM ===
async function searchNotebooks(query: string): Promise<string> {
  const q = query.toLowerCase();
  const { data: notebooks } = await supabase.from("notebooklm_notebooks").select("*").eq("is_active", true);
  if (!notebooks?.length) return "Chưa có notebook.";
  const matches = notebooks.filter((nb: any) => {
    if (nb.client_name && q.includes(nb.client_name.toLowerCase())) return true;
    if (nb.title.toLowerCase().includes(q)) return true;
    if (nb.keywords?.some((kw: string) => q.includes(kw.toLowerCase()))) return true;
    return false;
  });
  if (!matches.length) {
    let r = "📚 *NotebookLM:*\n\n";
    for (const nb of notebooks) r += `📓 *${nb.title}*${nb.client_name ? " (" + nb.client_name + ")" : ""}\n${nb.summary?.substring(0, 200)}...\n\n`;
    return r;
  }
  let r = "";
  for (const nb of matches) r += `📓 *${nb.title}*\n👤 ${nb.client_name || "N/A"} | 📄 ${nb.source_count} sources\n📝 ${nb.summary}\n🔗 ${nb.url}\n\n`;
  return r;
}

async function queryNotebook(query: string, notebookHint?: string): Promise<string> {
  const { data: notebooks } = await supabase.from("notebooklm_notebooks").select("*").eq("is_active", true);
  if (!notebooks?.length) return "Không có notebook.";
  let target = notebooks[0];
  if (notebookHint) {
    const hint = notebookHint.toLowerCase();
    const match = notebooks.find((nb: any) => nb.client_name?.toLowerCase().includes(hint) || nb.title.toLowerCase().includes(hint) || nb.keywords?.some((kw: string) => hint.includes(kw.toLowerCase())));
    if (match) target = match;
  }
  const { data: cached } = await supabase.from("notebooklm_query_cache").select("answer").eq("notebook_id", target.id).ilike("query", `%${query.substring(0, 50)}%`).limit(1).single();
  if (cached) return `📓 *${target.title}:*\n\n${cached.answer}`;
  return `📓 *${target.title}*\n\n${target.summary}\n\nℹ️ Chưa có cache. Dùng Antigravity desktop để sync.`;
}

async function listNotebooks(): Promise<string> {
  const { data: notebooks } = await supabase.from("notebooklm_notebooks").select("*").eq("is_active", true);
  if (!notebooks?.length) return "Chưa có notebook.";
  let r = "📚 *NotebookLM:*\n\n";
  for (const nb of notebooks) r += `📓 *${nb.title}*\n   👤 ${nb.client_name || "N/A"} | 📄 ${nb.source_count} sources\n   ${nb.summary?.substring(0, 150)}...\n\n`;
  return r;
}

// === SKILLS ===
async function getSkillsList(): Promise<string> {
  const { data } = await supabase.from("telegram_skills").select("id, name, description, category").eq("is_active", true).order("skill_number");
  if (!data?.length) return "Không có skill.";
  let r = "🎯 *Skills:*\n\n📊 *PGS Core:*\n";
  for (const s of data.filter((s: any) => s.category === "pgs")) r += `• ${s.name} — ${s.description}\n`;
  r += "\n📣 *Ads Stack:*\n";
  for (const s of data.filter((s: any) => s.category === "ads")) r += `• ${s.name} — ${s.description}\n`;
  return r;
}

async function findSkill(query: string): Promise<{id: string, name: string, skill_prompt: string} | null> {
  const { data } = await supabase.from("telegram_skills").select("id, name, skill_prompt, trigger_words").eq("is_active", true);
  if (!data) return null;
  const q = query.toLowerCase().replace(/_/g, "-");
  const exact = data.find((s: any) => q === s.id || q === "/" + s.id);
  if (exact) return exact;
  for (const s of data) { for (const tw of s.trigger_words) { if (q.includes(tw.toLowerCase())) return s; } }
  return null;
}

async function getActiveSession(chatId: number) {
  const { data } = await supabase.from("telegram_skill_sessions").select("*, telegram_skills(name, skill_prompt)").eq("chat_id", chatId).eq("status", "active").order("created_at", { ascending: false }).limit(1).single();
  return data;
}

async function startSkillSession(chatId: number, skillId: string, clientName?: string) {
  await supabase.from("telegram_skill_sessions").update({ status: "cancelled" }).eq("chat_id", chatId).eq("status", "active");
  await supabase.from("telegram_skill_sessions").insert({ chat_id: chatId, skill_id: skillId, client_name: clientName });
}

async function endSkillSession(chatId: number) {
  await supabase.from("telegram_skill_sessions").update({ status: "completed", updated_at: new Date().toISOString() }).eq("chat_id", chatId).eq("status", "active");
}

const CMD_ALIASES: Record<string, string> = {
  "scan": "business-scan", "bottleneck": "bottleneck-finder", "dreamer": "dream-buyer",
  "offer": "godfather-offer", "adsbrief": "ads-brief", "adscopy": "ads-create",
  "adscheck": "ads-monitor", "review": "kaizen-review", "hvco": "hvco-creator",
  "capture": "capture-leads", "traffic": "traffic-ads", "nurture": "magic-lantern",
  "sales": "sell-like-expert", "scale": "scale-up", "strategy": "strategy-proposal",
};

// === GEMINI ===
const BASE_PROMPT = `Bạn là AI Assistant của Cương Big — người kiến tạo Hệ thống Chuyển đổi cho Founder ngành đào tạo/tư vấn.
Bạn có quyền truy cập: Notion (clients/projects/tasks/meeting notes/deliverables/resources), NotebookLM, Skills CS, và PARA Content Router.

CS — Hệ thống Chuyển đổi (3 Pha × 9 GĐ):
- Pha A: GĐ1 Business Scan → GĐ2 Bottleneck → GĐ3 Strategy
- Pha B: GĐ4 Dream Buyer → GĐ5 HVCO → GĐ6 Capture Leads → GĐ7 Godfather Offer → GĐ8 Traffic
- Pha C: GĐ9 Scale Up + Bàn giao

PARA: Projects (có deadline) → Areas (duy trì) → Resources (tham khảo) → Archive (đã xong)

Quy tắc:
- Khi hỏi về client/project → dùng tool Notion
- Khi muốn phân loại/lưu nội dung → dùng tool para_save
- QUAN TRỌNG: sau khi para_save thành công, LUÔN include link Notion trong reply (từ field url trong kết quả tool)
- Khi muốn chạy skill → dùng tool start_skill
- Trả lời ngắn gọn, tiếng Việt, emoji, phù hợp Telegram.

Quy tắc PARA Save:
- KHÔNG BAO GIỜ tự động lưu ngay. Luôn tổng hợp lại trước rồi HỎI XÁC NHẬN:
  📌 Tên: [đề xuất tiêu đề]
  📂 Lưu vào: [category — Resource/Meeting Note/Project/Task/Deliverable]
  🔗 Links gồm: [liệt kê links nếu có]
  → Chờ user reply "ok" / "lưu đi" / chỉnh sửa trước khi gọi para_save.
- Khi user gửi NHIỀU link/nội dung trong 1 tin nhắn → coi là LIÊN QUAN nhau → gộp vào 1 page duy nhất (không tạo nhiều page riêng lẻ). Gộp tất cả links vào content.
- Chỉ gọi tool para_save SAU KHI user xác nhận.`;

const TOOLS = [
  { name: "search_client", description: "Tìm client Notion", parameters: { type: "OBJECT" as const, properties: { query: { type: "STRING" as const, description: "Tên client" } }, required: ["query"] } },
  { name: "list_clients", description: "Xem tất cả clients", parameters: { type: "OBJECT" as const, properties: {} } },
  { name: "list_projects", description: "Xem projects", parameters: { type: "OBJECT" as const, properties: { client_name: { type: "STRING" as const, description: "Lọc theo client" } } } },
  { name: "add_client_note", description: "Thêm ghi chú cho client", parameters: { type: "OBJECT" as const, properties: { client_name: { type: "STRING" as const, description: "Tên" }, note: { type: "STRING" as const, description: "Nội dung" } }, required: ["client_name", "note"] } },
  { name: "add_task", description: "Tạo task", parameters: { type: "OBJECT" as const, properties: { task_name: { type: "STRING" as const, description: "Tên" }, pgs_phase: { type: "STRING" as const, description: "GĐ1-GĐ9" }, priority: { type: "STRING" as const, description: "High/Urgent/Low" } }, required: ["task_name"] } },
  { name: "add_new_client", description: "Thêm client mới", parameters: { type: "OBJECT" as const, properties: { name: { type: "STRING" as const, description: "Tên" }, niche: { type: "STRING" as const, description: "Niche" }, email: { type: "STRING" as const, description: "Email" }, phone: { type: "STRING" as const, description: "SĐT" } }, required: ["name"] } },
  { name: "search_notebooks", description: "Tìm notebook NotebookLM", parameters: { type: "OBJECT" as const, properties: { query: { type: "STRING" as const, description: "Keyword" } }, required: ["query"] } },
  { name: "query_notebook", description: "Hỏi chi tiết từ NotebookLM", parameters: { type: "OBJECT" as const, properties: { query: { type: "STRING" as const, description: "Câu hỏi" }, notebook_hint: { type: "STRING" as const, description: "Tên client/notebook" } }, required: ["query"] } },
  { name: "list_notebooks", description: "Xem notebooks", parameters: { type: "OBJECT" as const, properties: {} } },
  { name: "start_skill", description: "Chạy skill CS", parameters: { type: "OBJECT" as const, properties: { skill_id: { type: "STRING" as const, description: "business-scan, bottleneck-finder, strategy-proposal, dream-buyer, hvco-creator, capture-leads, godfather-offer, traffic-ads, magic-lantern, sell-like-expert, scale-up, kaizen-review, ads-brief, ads-create, ads-monitor" }, client_name: { type: "STRING" as const, description: "Client" } }, required: ["skill_id"] } },
  { name: "end_skill", description: "Dừng skill", parameters: { type: "OBJECT" as const, properties: {} } },
  { name: "list_skills", description: "Xem skills", parameters: { type: "OBJECT" as const, properties: {} } },
  {
    name: "para_save",
    description: "Phân loại nội dung PARA và lưu vào Notion. Tool trả về {result, url} — url là link Notion trực tiếp, LUÔN gửi link này cho user.",
    parameters: { type: "OBJECT" as const, properties: {
      title: { type: "STRING" as const, description: "Tiêu đề ngắn gọn" },
      content: { type: "STRING" as const, description: "Nội dung / tóm tắt" },
      category: { type: "STRING" as const, description: "project | meeting_note | deliverable | resource | task" },
      client: { type: "STRING" as const, description: "Tên client" },
      pgs_phase: { type: "STRING" as const, description: "GĐ1-GĐ9" },
      cs_analysis: { type: "STRING" as const, description: "Ứng dụng CS: liên quan GĐ nào?" },
      sub_type: { type: "STRING" as const, description: "meeting_note: Kickoff/Strategy/Review/Weekly Sync/Ad-hoc | deliverable: Landing Page/Ad Creative/HVCO/Email Sequence/Sales Page/Report/SOP/Video" },
      url: { type: "STRING" as const, description: "URL nguồn (nếu có)" },
    }, required: ["title", "content", "category"] },
  },
  { name: "para_status", description: "PARA Dashboard — đếm items", parameters: { type: "OBJECT" as const, properties: {} } },
];

async function getParaStatus(): Promise<string> {
  try {
    const [projects, tasks, meetings, deliverables, paraPage] = await Promise.all([
      notionReq(`/databases/${NOTION_DB.projects}/query`, "POST", { page_size: 100 }),
      notionReq(`/databases/${NOTION_DB.tasks}/query`, "POST", { page_size: 100 }),
      notionReq(`/databases/${NOTION_DB.meeting_notes}/query`, "POST", { page_size: 100 }),
      notionReq(`/databases/${NOTION_DB.deliverables}/query`, "POST", { page_size: 100 }),
      notionReq(`/pages/${PARA_PAGE_ID}`),
    ]);
    let r = "🧠 *PARA Dashboard:*\n\n";
    r += `🚀 Projects: ${projects.results?.length || 0}\n`;
    r += `✅ Tasks: ${tasks.results?.length || 0}\n`;
    r += `📝 Meeting Notes: ${meetings.results?.length || 0}\n`;
    r += `📦 Deliverables: ${deliverables.results?.length || 0}\n`;
    r += `\n🔗 ${paraPage.url || "https://notion.so"}`;
    return r;
  } catch (e) { return `❌ Lỗi: ${String(e).substring(0, 200)}`; }
}

// v13: execTool now includes Notion URLs in all save results
async function execTool(name: string, args: any, chatId: number): Promise<string> {
  console.log(`Tool: ${name}`, JSON.stringify(args));
  switch (name) {
    case "search_client": return searchClients(args.query);
    case "list_clients": return listAllClients();
    case "list_projects": return listProjects(args.client_name);
    case "add_client_note": return addClientNote(args.client_name, args.note);
    case "add_task": {
      const t = await addTask(args.task_name, args.pgs_phase, args.priority);
      return `${t.result}${t.url ? "\n🔗 " + t.url : ""}`;
    }
    case "add_new_client": return addNewClient(args.name, args.niche, args.email, args.phone);
    case "search_notebooks": return searchNotebooks(args.query);
    case "query_notebook": return queryNotebook(args.query, args.notebook_hint);
    case "list_notebooks": return listNotebooks();
    case "start_skill": {
      const s = await findSkill(args.skill_id);
      if (!s) return "Không tìm thấy skill.";
      await startSkillSession(chatId, s.id, args.client_name);
      return `Đã bắt đầu: ${s.name}${args.client_name ? " cho " + args.client_name : ""}. Hướng dẫn:\n\n${s.skill_prompt}`;
    }
    case "end_skill": { await endSkillSession(chatId); return "✅ Skill kết thúc."; }
    case "list_skills": return getSkillsList();
    case "para_save": {
      const { title, content, category, client, pgs_phase, cs_analysis, sub_type, url } = args;
      let saveResult: { result: string; url: string };
      switch (category) {
        case "project": saveResult = await addProject(title, client, pgs_phase); break;
        case "meeting_note": saveResult = await addMeetingNote(title, client, sub_type, pgs_phase, new Date().toISOString().split("T")[0]); break;
        case "deliverable": saveResult = await addDeliverable(title, sub_type, client, pgs_phase, url); break;
        case "resource": saveResult = await addResource(title, content, url); break;
        case "task": { const t = await addTask(title, pgs_phase, "High"); saveResult = t; break; }
        default: saveResult = await addResource(title, content, url);
      }
      const catMap: Record<string, string> = { project: "🚀 Project", meeting_note: "📝 Meeting Note", deliverable: "📦 Deliverable", resource: "📚 Resource", task: "✅ Task" };
      let report = `🧠 *PARA Classification:*\n\n`;
      report += `📂 ${catMap[category] || category}: *${title}*\n`;
      if (client) report += `👤 ${client}\n`;
      if (pgs_phase) report += `📊 CS: ${pgs_phase}\n`;
      if (cs_analysis) report += `\n🎯 ${cs_analysis}\n`;
      report += `\n${saveResult.result}`;
      if (saveResult.url) report += `\n🔗 ${saveResult.url}`;
      return report;
    }
    case "para_status": return getParaStatus();
    default: return "Tool không tồn tại.";
  }
}

async function callGemini(messages: Array<{role: string, content: string}>, userMessage: string, chatId: number, skillContext?: string): Promise<string> {
  const contents = messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  contents.push({ role: "user", parts: [{ text: userMessage }] });
  let sysPrompt = BASE_PROMPT;
  if (skillContext) sysPrompt += `\n\n=== SKILL ĐANG CHẠY ===\n${skillContext}\nHướng dẫn từng bước. Hỏi từng câu, chờ trả lời. Khi đủ data → output report.`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  console.log(`[Gemini] Call 1: ${contents.length} messages, last="${userMessage.substring(0, 50)}"`);
  const res = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system_instruction: { parts: [{ text: sysPrompt }] }, contents, tools: [{ function_declarations: TOOLS }], generationConfig: { temperature: 0.7, maxOutputTokens: 3000 } }),
  });
  const data = await res.json();
  if (!res.ok) { console.log(`[Gemini] Call 1 ERROR: ${res.status}`, JSON.stringify(data?.error).substring(0, 200)); return `⚠️ ${data?.error?.message || res.status}`; }
  const cand = data.candidates?.[0];
  const finishReason = cand?.finishReason || "unknown";
  console.log(`[Gemini] Call 1 result: finishReason=${finishReason}, parts=${cand?.content?.parts?.length || 0}`);
  if (!cand?.content?.parts?.length) {
    console.log(`[Gemini] Call 1 NO PARTS. Full response:`, JSON.stringify(data).substring(0, 500));
    return "⚠️ Không có phản hồi (empty).";
  }
  const fc = cand.content.parts.find((p: any) => p.functionCall);
  if (fc) {
    const { name, args } = fc.functionCall;
    console.log(`[Gemini] Tool call: ${name}`, JSON.stringify(args).substring(0, 200));
    const toolResult = await execTool(name, args || {}, chatId);
    console.log(`[Gemini] Tool result (${toolResult.length} chars):`, toolResult.substring(0, 200));
    const fContents = [...contents,
      { role: "model", parts: [{ functionCall: { name, args: args || {} } }] },
      { role: "function", parts: [{ functionResponse: { name, response: { result: toolResult } } }] }
    ];
    console.log(`[Gemini] Call 2: ${fContents.length} messages (with tool result)`);
    const f = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ system_instruction: { parts: [{ text: sysPrompt }] }, contents: fContents, tools: [{ function_declarations: TOOLS }], generationConfig: { temperature: 0.7, maxOutputTokens: 3000 } }) });
    const fd = await f.json();
    if (!f.ok) { console.log(`[Gemini] Call 2 ERROR: ${f.status}`, JSON.stringify(fd?.error).substring(0, 200)); return toolResult; }
    const cand2 = fd.candidates?.[0];
    const fr2 = cand2?.finishReason || "unknown";
    console.log(`[Gemini] Call 2 result: finishReason=${fr2}, parts=${cand2?.content?.parts?.length || 0}`);
    if (!cand2?.content?.parts?.length) {
      console.log(`[Gemini] Call 2 NO PARTS. Full:`, JSON.stringify(fd).substring(0, 500));
      return toolResult;
    }
    // Find text in any part, not just parts[0]
    const textPart = cand2.content.parts.find((p: any) => p.text);
    if (textPart) return textPart.text;
    // If Gemini called another tool, just return the first tool's result
    console.log(`[Gemini] Call 2 no text part. Parts:`, JSON.stringify(cand2.content.parts).substring(0, 300));
    return toolResult;
  }
  const textPart = cand.content.parts.find((p: any) => p.text);
  return textPart?.text || "⚠️ Không có phản hồi.";
}

// === TELEGRAM ===
async function sendMsg(chatId: number, text: string) {
  const chunks: string[] = []; let rem = text;
  while (rem.length > 0) { if (rem.length <= 4000) { chunks.push(rem); break; } let s = rem.lastIndexOf("\n", 4000); if (s < 2000) s = 4000; chunks.push(rem.substring(0, s)); rem = rem.substring(s); }
  for (const c of chunks) {
    let r = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: c, parse_mode: "Markdown" }) });
    if (!r.ok) await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: c }) });
  }
}
async function typing(chatId: number) { await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendChatAction`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, action: "typing" }) }); }
async function isAllowed(chatId: number) { const { data } = await supabase.from("telegram_allowed_users").select("is_active").eq("chat_id", chatId).single(); return data?.is_active === true; }
async function getHistory(chatId: number, limit = 10) { const { data } = await supabase.from("telegram_chat_history").select("role, content").eq("chat_id", chatId).order("created_at", { ascending: false }).limit(limit); return (data || []).reverse(); }
async function saveMsg(chatId: number, userName: string, role: string, content: string) { await supabase.from("telegram_chat_history").insert({ chat_id: chatId, user_name: userName, role, content }); }

// === MAIN ===
Deno.serve(async (req: Request) => {
  if (req.method === "GET") return new Response(JSON.stringify({ status: "ok", version: 22, features: ["para-confirm", "notion-urls-fixed", "pr-shortcut", "tool-response-fix", "debug-logging", "skills", "notebooklm"] }), { headers: { "Content-Type": "application/json" } });
  try {
    const body = await req.json();
    const message = body.message;
    if (!message?.text) return new Response("OK", { status: 200 });
    const chatId = message.chat.id;
    const userName = message.from?.first_name || "there";
    const text = message.text.trim();
    console.log(`[${userName}/${chatId}] ${text}`);

    if (text === "/start" || text.startsWith("/start ")) {
      const ok = await isAllowed(chatId);
      await sendMsg(chatId, ok ? `🚀 *Sumo AI Bot v22*\n\nChào ${userName}!\n📊 Notion • 📚 NotebookLM • 🎯 Skills • 🧠 PARA\n\n/pr — PARA Router\n/ps — Dashboard\n/cs — Hệ thống Chuyển đổi` : `⚠️ Chưa có quyền. ID: ${chatId}`);
      return new Response("OK");
    }
    if (text === "/clear") { await supabase.from("telegram_chat_history").delete().eq("chat_id", chatId); await sendMsg(chatId, "🗑️ Xóa xong!"); return new Response("OK"); }
    if (text === "/stop") { await endSkillSession(chatId); await sendMsg(chatId, "⏹️ Skill dừng."); return new Response("OK"); }
    if (text === "/skills") { await typing(chatId); await sendMsg(chatId, await getSkillsList()); return new Response("OK"); }
    if (text === "/clients") { await typing(chatId); await sendMsg(chatId, await listAllClients()); return new Response("OK"); }
    if (text === "/projects") { await typing(chatId); await sendMsg(chatId, await listProjects()); return new Response("OK"); }
    if (text === "/notebooks") { await typing(chatId); await sendMsg(chatId, await listNotebooks()); return new Response("OK"); }
    if (text === "/ps" || text === "/parastatus") { await typing(chatId); await sendMsg(chatId, await getParaStatus()); return new Response("OK"); }
    if (text === "/cs" || text === "/pgs") {
      await sendMsg(chatId, `\ud83c\udfd7\ufe0f *CS \u2014 H\u1ec7 th\u1ed1ng Chuy\u1ec3n \u0111\u1ed5i (3 Pha \u00d7 9 G\u0110):*\n\n\ud83d\udd0d *Pha A \u2014 Th\u1ea5u hi\u1ec3u:*\n1\ufe0f\u20e3 G\u01101: Business Scan\n2\ufe0f\u20e3 G\u01102: Bottleneck\n3\ufe0f\u20e3 G\u01103: Strategy\n\n\u26a1 *Pha B \u2014 Ki\u1ebfn t\u1ea1o:*\n4\ufe0f\u20e3 G\u01104: Dream Buyer\n5\ufe0f\u20e3 G\u01105: HVCO\n6\ufe0f\u20e3 G\u01106: Capture Leads\n7\ufe0f\u20e3 G\u01107: Godfather Offer\n8\ufe0f\u20e3 G\u01108: Traffic\n\n\ud83d\ude80 *Pha C \u2014 B\u00e0n giao:*\n9\ufe0f\u20e3 G\u01109: Scale Up`);
      return new Response("OK");
    }
    if (text === "/pr" || text === "/para") {
      await typing(chatId);
      await sendMsg(chatId, `\ud83e\udde0 *PARA Router*\n\nG\u1eedi n\u1ed9i dung \u2192 Bot \u0111\u1ec1 xu\u1ea5t t\u00ean + ph\u00e2n lo\u1ea1i \u2192 X\u00e1c nh\u1eadn \u2192 L\u01b0u Notion!\n\n\ud83d\udcac G\u1eedi link, ghi ch\u00fa, \u00fd t\u01b0\u1edfng \u2014 bot lo ph\u1ea7n c\u00f2n l\u1ea1i\n\ud83d\udcca /ps \u2014 xem dashboard`);
      return new Response("OK");
    }

    // Skill shortcuts
    if (text.startsWith("/") && !text.includes(" ")) {
      const cmd = text.substring(1).toLowerCase();
      const skillId = CMD_ALIASES[cmd] || cmd.replace(/_/g, "-");
      const skill = await findSkill(skillId);
      if (skill) {
        await typing(chatId);
        await startSkillSession(chatId, skill.id);
        const h = await getHistory(chatId, 5);
        await saveMsg(chatId, userName, "user", `Chạy: ${skill.name}`);
        const r = await callGemini(h, `Chạy skill ${skill.name}. Bắt đầu hướng dẫn.`, chatId, skill.skill_prompt);
        await saveMsg(chatId, "bot", "assistant", r); await sendMsg(chatId, r);
        return new Response("OK");
      }
    }

    if (!(await isAllowed(chatId))) { await sendMsg(chatId, `⚠️ ID: ${chatId}`); return new Response("OK"); }

    await typing(chatId);
    const session = await getActiveSession(chatId);
    const skillCtx = session?.telegram_skills?.skill_prompt || undefined;
    const history = await getHistory(chatId, session ? 15 : 10);
    await saveMsg(chatId, userName, "user", text);
    const aiResp = await callGemini(history, text, chatId, skillCtx);
    await saveMsg(chatId, "bot", "assistant", aiResp);
    await sendMsg(chatId, aiResp);
    return new Response("OK");
  } catch (error) { console.error("ERR:", error); return new Response("OK", { status: 200 }); }
});
