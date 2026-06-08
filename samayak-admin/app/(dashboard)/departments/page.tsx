"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Upload, Pencil, Trash2, AlertCircle, GitBranch } from "lucide-react";
import { SearchBar } from "@/components/ui/SearchBar";
import { toast } from "sonner";
import { PageHeader } from "@/components/tables/DataTable";
import { DataTable, Pagination } from "@/components/tables/DataTable";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/Input";
import { BulkImport } from "@/components/import/BulkImport";
import { IconButton } from "@/components/ui/IconButton";

interface Department {
  id: string;
  name: string;
  code: string;
  _count: { branches: number; rooms: number; courses: number; faculty: number };
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [branchForm, setBranchForm] = useState({ departmentId: "", name: "", code: "", semester: "6", section: "A" });
  const [deleteWarning, setDeleteWarning] = useState<{ dept: Department; deps: Record<string, number> } | null>(null);
  const [showImport, setShowImport] = useState(false);

  const fetchDepartments = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(pagination.page), limit: String(pagination.limit), search });
    const res = await fetch(`/api/departments?${params}`);
    if (res.ok) {
      const data = await res.json();
      setDepartments(data.data);
      setPagination(data.pagination);
    }
    setLoading(false);
  }, [pagination.page, pagination.limit, search]);

  useEffect(() => { fetchDepartments(); }, [fetchDepartments]);

  const handleSave = async () => {
    const method = editing ? "PUT" : "POST";
    const url = editing ? `/api/departments/${editing.id}` : "/api/departments";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: formName, code: formCode }),
    });
    if (res.ok) {
      toast.success(editing ? "Department updated" : "Department created");
      setShowModal(false);
      fetchDepartments();
    } else {
      toast.error((await res.json()).error || "Failed to save");
    }
  };

  const handleSaveBranch = async () => {
    const res = await fetch(`/api/departments/${branchForm.departmentId}/branches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(branchForm),
    });
    if (res.ok) {
      toast.success("Branch created");
      setShowBranchModal(false);
      fetchDepartments();
    } else {
      toast.error((await res.json()).error || "Failed to create branch");
    }
  };

  const handleDelete = async (dept: Department) => {
    const res = await fetch(`/api/departments/${dept.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Department deleted");
      fetchDepartments();
    } else {
      const err = await res.json();
      if (err.dependencies) setDeleteWarning({ dept, deps: err.dependencies });
      else toast.error(err.error || "Failed to delete");
    }
  };

  const handleImport = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/departments/import", { method: "POST", body: formData });
    if (res.ok) {
      toast.success("Import queued successfully");
      setShowImport(false);
      setTimeout(fetchDepartments, 2000);
    } else toast.error("Import failed");
  };

  return (
    <div className="page-section">
      <PageHeader
        title="Departments"
        description={`Manage departments and branches • ${pagination.total} total`}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}>
              <Upload size={14} /> Import
            </Button>
            <Button variant="secondary" size="sm" onClick={() => {
              setBranchForm({ departmentId: departments[0]?.id || "", name: "", code: "", semester: "6", section: "A" });
              setShowBranchModal(true);
            }}>
              <GitBranch size={14} /> Add Branch
            </Button>
            <Button size="sm" onClick={() => { setEditing(null); setFormName(""); setFormCode(""); setShowModal(true); }}>
              <Plus size={14} /> Add Department
            </Button>
          </>
        }
      />

      <SearchBar
        placeholder="Search departments..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <DataTable
        loading={loading}
        data={departments}
        keyExtractor={(d) => d.id}
        emptyMessage="No departments found"
        columns={[
          { key: "name", header: "Name", render: (d) => <span className="font-semibold">{d.name}</span> },
          { key: "code", header: "Code", render: (d) => <Badge variant="brand">{d.code}</Badge> },
          { key: "branches", header: "Branches", align: "center", render: (d) => d._count.branches },
          { key: "rooms", header: "Rooms", align: "center", render: (d) => d._count.rooms },
          { key: "courses", header: "Courses", align: "center", render: (d) => d._count.courses },
          { key: "faculty", header: "Faculty", align: "center", render: (d) => d._count.faculty },
          {
            key: "actions", header: "Actions", align: "right",
            render: (d) => (
              <div className="flex gap-1 justify-end">
                <IconButton onClick={() => { setEditing(d); setFormName(d.name); setFormCode(d.code); setShowModal(true); }}>
                  <Pencil size={14} />
                </IconButton>
                <IconButton variant="danger" onClick={() => handleDelete(d)}>
                  <Trash2 size={14} />
                </IconButton>
              </div>
            ),
          },
        ]}
      />
      <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))} />

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit Department" : "Add Department"}>
        <div className="space-y-4">
          <Input label="Name" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Computer Science & Engineering" />
          <Input label="Code (unique)" value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder="CSE" />
          <Button onClick={handleSave} className="w-full justify-center">{editing ? "Update" : "Create"}</Button>
        </div>
      </Modal>

      <Modal open={showBranchModal} onClose={() => setShowBranchModal(false)} title="Add Branch">
        <div className="space-y-4">
          <Select label="Department" value={branchForm.departmentId} onChange={(e) => setBranchForm({ ...branchForm, departmentId: e.target.value })}>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Input label="Branch Name" value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} placeholder="Computer Science" />
          <Input label="Branch Code" value={branchForm.code} onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })} placeholder="CS" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Semester" type="number" value={branchForm.semester} onChange={(e) => setBranchForm({ ...branchForm, semester: e.target.value })} />
            <Input label="Section" value={branchForm.section} onChange={(e) => setBranchForm({ ...branchForm, section: e.target.value })} placeholder="A" />
          </div>
          <Button onClick={handleSaveBranch} className="w-full justify-center">Create Branch</Button>
        </div>
      </Modal>

      <Modal open={!!deleteWarning} onClose={() => setDeleteWarning(null)} title="Cannot Delete Department">
        <div className="space-y-3">
          <div className="flex gap-2 p-3 rounded-[14px] bg-warning/10 text-warning text-sm">
            <AlertCircle size={18} className="shrink-0" />
            <p><strong>{deleteWarning?.dept.name}</strong> has dependent records that must be removed first.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {deleteWarning && Object.entries(deleteWarning.deps).filter(([, v]) => v > 0).map(([key, value]) => (
              <div key={key} className="p-2 rounded-lg bg-surface-2">
                <span className="font-semibold">{value}</span> {key}
              </div>
            ))}
          </div>
          <Button variant="secondary" onClick={() => setDeleteWarning(null)} className="w-full justify-center">Close</Button>
        </div>
      </Modal>

      <Modal open={showImport} onClose={() => setShowImport(false)} title="Import Departments">
        <BulkImport
          onUpload={handleImport}
          hint="Columns: name | code | type (department/branch) | parentCode"
        />
      </Modal>
    </div>
  );
}
