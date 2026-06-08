"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Upload, Pencil, Trash2, AlertTriangle, Filter } from "lucide-react";
import { SearchBar } from "@/components/ui/SearchBar";
import { toast } from "sonner";
import { PageHeader, DataTable, Pagination, ScopeBanner } from "@/components/tables/DataTable";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/Input";
import { BulkImport } from "@/components/import/BulkImport";
import { IconButton } from "@/components/ui/IconButton";

interface BranchInfo {
  id: string;
  code: string;
  semester: number;
  section: string | null;
}

interface FlatCourse {
  id: string;
  code: string;
  name: string;
  credits: number;
  type: string;
  branch: { name: string; code: string; semester: number; section: string | null };
  _count: { slots: number };
  grouped?: false;
}

interface GroupedCourse {
  code: string;
  name: string;
  credits: number;
  type: string;
  branchLabel: string;
  branches: BranchInfo[];
  ids: string[];
  totalSlots: number;
  grouped: true;
}

type CourseRow = FlatCourse | GroupedCourse;

function isGroupedCourse(row: CourseRow): row is GroupedCourse {
  return "grouped" in row && row.grouped === true;
}

interface Branch {
  id: string;
  name: string;
  code: string;
  semester: number;
  section: string | null;
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [grouped, setGrouped] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<{ id: string; code: string; name: string; credits: number; type: string } | null>(null);
  const [form, setForm] = useState({ code: "", name: "", credits: "", type: "LECTURE", departmentId: "", branchId: "" });
  const [showImport, setShowImport] = useState(false);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(pagination.page), limit: String(pagination.limit), search });
    if (selectedBranch) params.set("branchId", selectedBranch);
    if (selectedSemester) params.set("semester", selectedSemester);
    const res = await fetch(`/api/courses?${params}`);
    if (res.ok) {
      const data = await res.json();
      setCourses(data.data);
      setGrouped(Boolean(data.grouped));
      setPagination(data.pagination);
    }
    setLoading(false);
  }, [pagination.page, pagination.limit, search, selectedBranch, selectedSemester]);

  const fetchBranches = useCallback(async () => {
    const res = await fetch("/api/departments?limit=100");
    if (res.ok) {
      const data = await res.json();
      setDepartments(data.data);
      const allBranches: Branch[] = [];
      for (const dept of data.data) {
        const dRes = await fetch(`/api/departments/${dept.id}`);
        if (dRes.ok) {
          const dData = await dRes.json();
          if (dData.branches) allBranches.push(...dData.branches);
        }
      }
      setBranches(allBranches);
    }
  }, []);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);
  useEffect(() => { fetchBranches(); }, [fetchBranches]);

  const handleSave = async () => {
    const method = editing ? "PUT" : "POST";
    const url = editing ? `/api/courses/${editing.id}` : "/api/courses";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, credits: parseInt(form.credits) }),
    });
    if (res.ok) { toast.success(editing ? "Course updated" : "Course created"); setShowModal(false); fetchCourses(); }
    else toast.error((await res.json()).error || "Failed to save");
  };

  const handleDelete = async (course: CourseRow) => {
    const ids = isGroupedCourse(course) ? course.ids : [course.id];
    const label = isGroupedCourse(course)
      ? `${course.code} (${course.branches.length} branches)`
      : course.code;
    if (!confirm(`Delete ${label}?`)) return;

    const results = await Promise.all(
      ids.map((id) => fetch(`/api/courses/${id}`, { method: "DELETE" }))
    );
    if (results.every((r) => r.ok)) {
      toast.success(ids.length > 1 ? `Deleted ${ids.length} course entries` : "Course deleted");
      fetchCourses();
    } else {
      toast.error("Some deletions failed");
    }
  };

  const handleImport = async (file: File) => {
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch("/api/courses/import", { method: "POST", body: fd });
    if (res.ok) { toast.success("Import queued"); setShowImport(false); setTimeout(fetchCourses, 2000); }
    else toast.error("Import failed");
  };

  const uniqueSemesters = [...new Set(branches.map((b) => b.semester))].sort();
  const selectedBranchObj = branches.find((b) => b.id === selectedBranch);
  const scopeText = selectedBranchObj
    ? `CSE / ${selectedBranchObj.code}${selectedBranchObj.section ? ` ${selectedBranchObj.section}` : ""} / Semester ${selectedBranchObj.semester}`
    : selectedSemester ? `Semester ${selectedSemester}` : "All courses";

  const typeVariant = (type: string) => {
    if (type === "LECTURE") return "lecture" as const;
    if (type === "LAB") return "lab" as const;
    return "tutorial" as const;
  };

  const openEdit = (course: CourseRow) => {
    const id = isGroupedCourse(course) ? course.ids[0] : course.id;
    setEditing({
      id,
      code: course.code,
      name: course.name,
      credits: course.credits,
      type: course.type,
    });
    setForm({
      code: course.code,
      name: course.name,
      credits: String(course.credits),
      type: course.type,
      departmentId: "",
      branchId: "",
    });
    setShowModal(true);
  };

  return (
    <div className="page-section">
      <PageHeader
        title="Courses / Subjects"
        description={`${pagination.total} courses`}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}><Upload size={14} /> Import</Button>
            <Button size="sm" onClick={() => { setEditing(null); setForm({ code: "", name: "", credits: "", type: "LECTURE", departmentId: departments[0]?.id || "", branchId: branches[0]?.id || "" }); setShowModal(true); }}>
              <Plus size={14} /> Add Course
            </Button>
          </>
        }
      />

      <ScopeBanner label={scopeText} />

      <div className="flex flex-wrap gap-3 items-center">
        <span className="flex items-center gap-1.5 text-sm text-text-secondary"><Filter size={14} /> Filters</span>
        <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}
          className="px-3.5 py-2 rounded-xl text-sm bg-surface-1 border border-border shadow-sm outline-none min-w-[160px] focus:border-brand-secondary focus:ring-2 focus:ring-brand-secondary/20">
          <option value="">All Branches</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.code}{b.section ? ` ${b.section}` : ""} (Sem {b.semester})</option>)}
        </select>
        <select value={selectedSemester} onChange={(e) => setSelectedSemester(e.target.value)}
          className="px-3.5 py-2 rounded-xl text-sm bg-surface-1 border border-border shadow-sm outline-none min-w-[140px] focus:border-brand-secondary focus:ring-2 focus:ring-brand-secondary/20">
          <option value="">All Semesters</option>
          {uniqueSemesters.map((s) => <option key={s} value={String(s)}>Semester {s}</option>)}
        </select>
        <SearchBar
          placeholder="Search courses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          wrapperClassName="flex-1 max-w-xs"
        />
      </div>

      <DataTable
        loading={loading}
        data={courses}
        keyExtractor={(c) => (isGroupedCourse(c) ? c.code : c.id)}
        columns={[
          { key: "code", header: "Code", render: (c) => <span className="font-semibold">{c.code}</span> },
          { key: "name", header: "Name", render: (c) => c.name },
          {
            key: "branch",
            header: "Branch",
            render: (c) => (
              <span className="text-text-secondary text-xs">
                {isGroupedCourse(c)
                  ? c.branchLabel
                  : `${c.branch.code} Sem ${c.branch.semester}${c.branch.section ? ` ${c.branch.section}` : ""}`}
              </span>
            ),
          },
          { key: "type", header: "Type", render: (c) => <Badge variant={typeVariant(c.type)}>{c.type}</Badge> },
          {
            key: "credits", header: "Credits", align: "center",
            render: (c) => c.credits === 0 ? (
              <Badge variant="warning"><AlertTriangle size={10} className="inline mr-1" />0</Badge>
            ) : c.credits,
          },
          {
            key: "slots",
            header: "Slots",
            align: "center",
            render: (c) => (isGroupedCourse(c) ? c.totalSlots : c._count.slots),
          },
          {
            key: "actions", header: "Actions", align: "right",
            render: (c) => (
              <div className="flex gap-1 justify-end">
                <IconButton onClick={() => openEdit(c)}>
                  <Pencil size={14} />
                </IconButton>
                <IconButton variant="danger" onClick={() => handleDelete(c)}><Trash2 size={14} /></IconButton>
              </div>
            ),
          },
        ]}
      />
      <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))} />

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit Course" : "Add Course"}>
        <div className="space-y-4">
          <Input label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Credits" type="number" value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} />
            <Select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="LECTURE">Lecture</option>
              <option value="LAB">Lab</option>
              <option value="TUTORIAL">Tutorial</option>
            </Select>
          </div>
          {!editing && (
            <>
              <Select label="Department" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
              <Select label="Branch" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.code} Sem {b.semester}{b.section ? ` ${b.section}` : ""}</option>)}
              </Select>
            </>
          )}
          {editing && grouped && (
            <p className="text-xs text-text-muted">
              Editing applies to one branch entry. Use branch filter to edit a specific section.
            </p>
          )}
          <Button onClick={handleSave} className="w-full justify-center">{editing ? "Update" : "Create"}</Button>
        </div>
      </Modal>

      <Modal open={showImport} onClose={() => setShowImport(false)} title="Import Courses">
        <BulkImport onUpload={handleImport} hint="Columns: code | name | credits | type | branchCode | semester" />
      </Modal>
    </div>
  );
}
