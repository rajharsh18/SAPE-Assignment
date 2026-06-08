"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Upload, Pencil, Trash2, RotateCcw } from "lucide-react";
import { SearchBar } from "@/components/ui/SearchBar";
import { toast } from "sonner";
import {
  PageHeader,
  DataTable,
  Pagination,
} from "@/components/tables/DataTable";
import { Button } from "@/components/ui/Button";
import { Badge, roleBadgeVariant } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/Input";
import { BulkImport } from "@/components/import/BulkImport";
import { IconButton } from "@/components/ui/IconButton";

interface Faculty {
  id: string;
  name: string;
  email: string;
  role: string;
  deletedAt: string | null;
  department: { name: string; code: string } | null;
  _count: { courses: number };
}

interface PreviewRow {
  row: number;
  name: string;
  email: string;
  role: string;
  departmentCode: string;
  isDuplicate: boolean;
  existingName: string | null;
  action?: "skip" | "update" | "create";
}

export default function FacultyPage() {
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Faculty | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "PROFESSOR",
    departmentId: "",
  });
  const [departments, setDepartments] = useState<
    Array<{ id: string; name: string; code: string }>
  >([]);
  const [showImport, setShowImport] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewRow[] | null>(null);
  const [importing, setImporting] = useState(false);

  const fetchFaculty = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(pagination.page),
      limit: String(pagination.limit),
      search,
      showDeleted: String(showDeleted),
    });
    if (roleFilter) params.set("role", roleFilter);
    const res = await fetch(`/api/faculty?${params}`);
    if (res.ok) {
      const data = await res.json();
      setFaculty(data.data);
      setPagination(data.pagination);
    }
    setLoading(false);
  }, [pagination.page, pagination.limit, search, roleFilter, showDeleted]);

  useEffect(() => {
    fetchFaculty();
  }, [fetchFaculty]);
  useEffect(() => {
    fetch("/api/departments?limit=100")
      .then((r) => r.json())
      .then((d) => setDepartments(d.data || []));
  }, []);

  const handleSave = async () => {
    const method = editing ? "PUT" : "POST";
    const url = editing ? `/api/faculty/${editing.id}` : "/api/faculty";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toast.success(editing ? "Faculty updated" : "Faculty created");
      setShowModal(false);
      fetchFaculty();
    } else toast.error((await res.json()).error);
  };

  const handleDelete = async (f: Faculty) => {
    if (!confirm(`Deactivate ${f.name}?`)) return;
    const res = await fetch(`/api/faculty/${f.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Faculty deactivated");
      fetchFaculty();
    }
  };

  const handleRestore = async (f: Faculty) => {
    const res = await fetch(`/api/faculty/${f.id}/restore`, { method: "PUT" });
    if (res.ok) {
      toast.success("Faculty restored");
      fetchFaculty();
    }
  };

  const handlePreviewImport = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/faculty/import/preview", {
      method: "POST",
      body: fd,
    });
    if (res.ok) {
      const data = await res.json();
      setPreviewData(
        data.rows.map((r: PreviewRow) => ({
          ...r,
          action: r.isDuplicate ? "skip" : "create",
        })),
      );
    } else toast.error("Failed to parse file");
  };

  const handleCommitImport = async () => {
    if (!previewData) return;
    setImporting(true);
    const res = await fetch("/api/faculty/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: previewData }),
    });
    if (res.ok) {
      const data = await res.json();
      toast.success(
        `Created: ${data.created}, Updated: ${data.updated}, Skipped: ${data.skipped}`,
      );
      setPreviewData(null);
      setShowImport(false);
      fetchFaculty();
    } else toast.error("Import failed");
    setImporting(false);
  };

  return (
    <div className="page-section">
      <PageHeader
        title="Faculty & Users"
        description={`${pagination.total} users`}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowImport(true)}
            >
              <Upload size={14} /> Import
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setForm({
                  name: "",
                  email: "",
                  role: "PROFESSOR",
                  departmentId: departments[0]?.id || "",
                });
                setShowModal(true);
              }}
            >
              <Plus size={14} /> Add Faculty
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-3 items-center">
        <SearchBar
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          wrapperClassName="flex-1 max-w-xs"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3.5 py-2 rounded-xl text-sm bg-surface-1 border border-border shadow-sm outline-none focus:border-brand-secondary focus:ring-2 focus:ring-brand-secondary/20"
        >
          <option value="">All Roles</option>
          {["ADMIN", "HOD", "DEAN", "COORDINATOR", "PROFESSOR"].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={showDeleted}
            onChange={(e) => setShowDeleted(e.target.checked)}
          />
          Show deactivated
        </label>
      </div>

      <DataTable
        loading={loading}
        data={faculty}
        keyExtractor={(f) => f.id}
        columns={[
          {
            key: "name",
            header: "Name",
            render: (f) => (
              <span className={f.deletedAt ? "opacity-50" : ""}>
                <span className="font-semibold">{f.name}</span>
                {f.deletedAt && (
                  <span className="text-[10px] text-danger ml-2">
                    DEACTIVATED
                  </span>
                )}
              </span>
            ),
          },
          {
            key: "email",
            header: "Email",
            render: (f) => (
              <span className="text-text-secondary">{f.email}</span>
            ),
          },
          {
            key: "role",
            header: "Role",
            render: (f) => (
              <Badge variant={roleBadgeVariant(f.role)}>{f.role}</Badge>
            ),
          },
          {
            key: "dept",
            header: "Department",
            render: (f) => (
              <span className="text-text-secondary">
                {f.department?.name || "—"}
              </span>
            ),
          },
          {
            key: "courses",
            header: "Courses",
            align: "center",
            render: (f) => f._count.courses,
          },
          {
            key: "actions",
            header: "Actions",
            align: "right",
            render: (f) => (
              <div className="flex gap-1 justify-end">
                {f.deletedAt ? (
                  <IconButton
                    variant="success"
                    onClick={() => handleRestore(f)}
                    title="Restore"
                  >
                    <RotateCcw size={14} />
                  </IconButton>
                ) : (
                  <>
                    <IconButton
                      onClick={() => {
                        setEditing(f);
                        setForm({
                          name: f.name,
                          email: f.email,
                          role: f.role,
                          departmentId: "",
                        });
                        setShowModal(true);
                      }}
                    >
                      <Pencil size={14} />
                    </IconButton>
                    <IconButton
                      variant="danger"
                      onClick={() => handleDelete(f)}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </>
                )}
              </div>
            ),
          },
        ]}
      />
      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
      />

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? "Edit Faculty" : "Add Faculty"}
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Select
            label="Role"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            {["ADMIN", "HOD", "DEAN", "COORDINATOR", "PROFESSOR"].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
          <Select
            label="Department"
            value={form.departmentId}
            onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
          >
            <option value="">None</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Button onClick={handleSave} className="w-full justify-center">
            {editing ? "Update" : "Create"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={showImport}
        onClose={() => {
          setShowImport(false);
          setPreviewData(null);
        }}
        title={previewData ? "Review Import" : "Import Faculty"}
        size={previewData ? "lg" : "md"}
      >
        {!previewData ? (
          <BulkImport
            onUpload={handlePreviewImport}
            hint="Columns: name | email | role | departmentCode"
          />
        ) : (
          <div>
            <div className="flex gap-3 mb-4">
              <Badge variant="classroom">
                New: {previewData.filter((r) => !r.isDuplicate).length}
              </Badge>
              <Badge variant="warning">
                Duplicates: {previewData.filter((r) => r.isDuplicate).length}
              </Badge>
            </div>
            <div className="overflow-x-auto max-h-[50vh]">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    {["Name", "Email", "Role", "Status", "Action"].map((h) => (
                      <th
                        key={h}
                        className="text-left py-2 px-3 text-text-secondary uppercase font-medium"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((row, idx) => (
                    <tr key={idx} className="border-b border-surface-3">
                      <td className="py-2 px-3">{row.name}</td>
                      <td className="py-2 px-3 text-text-secondary">
                        {row.email}
                      </td>
                      <td className="py-2 px-3">
                        <Badge variant={roleBadgeVariant(row.role)}>
                          {row.role}
                        </Badge>
                      </td>
                      <td className="py-2 px-3">
                        {row.isDuplicate ? (
                          <span className="text-warning">
                            Exists ({row.existingName})
                          </span>
                        ) : (
                          <span className="text-success">New</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {row.isDuplicate ? (
                          <select
                            value={row.action}
                            onChange={(e) => {
                              const updated = [...previewData];
                              updated[idx] = {
                                ...row,
                                action: e.target.value as "skip" | "update",
                              };
                              setPreviewData(updated);
                            }}
                            className="px-2 py-1 rounded-md border border-border text-xs"
                          >
                            <option value="skip">Skip</option>
                            <option value="update">Update</option>
                          </select>
                        ) : (
                          <span className="text-text-muted">Create</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 mt-4 justify-end">
              <Button variant="secondary" onClick={() => setPreviewData(null)}>
                Back
              </Button>
              <Button onClick={handleCommitImport} disabled={importing}>
                {importing ? "Importing..." : "Confirm Import"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
