"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Upload, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { SearchBar } from "@/components/ui/SearchBar";
import { toast } from "sonner";
import { notifyAnalyticsRefresh } from "@/lib/analytics-events";
import { PageHeader, DataTable, Pagination } from "@/components/tables/DataTable";
import { Button } from "@/components/ui/Button";
import { Badge, roomBadgeVariant } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/Input";
import { BulkImport } from "@/components/import/BulkImport";
import { IconButton } from "@/components/ui/IconButton";

interface Room {
  id: string;
  roomNumber: string;
  capacity: number;
  type: string;
  department: { name: string; code: string };
  _count: { slots: number };
}

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [form, setForm] = useState({ roomNumber: "", departmentId: "", capacity: "", type: "CLASSROOM" });
  const [showImport, setShowImport] = useState(false);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(pagination.page), limit: String(pagination.limit), search });
    const res = await fetch(`/api/rooms?${params}`);
    if (res.ok) {
      const data = await res.json();
      setRooms(data.data);
      setPagination(data.pagination);
    }
    setLoading(false);
  }, [pagination.page, pagination.limit, search]);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);
  useEffect(() => {
    fetch("/api/departments?limit=100").then((r) => r.json()).then((d) => setDepartments(d.data || []));
  }, []);

  const handleSave = async () => {
    const method = editing ? "PUT" : "POST";
    const url = editing ? `/api/rooms/${editing.id}` : "/api/rooms";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toast.success(editing ? "Room updated" : "Room created");
      setShowModal(false);
      fetchRooms();
      notifyAnalyticsRefresh();
    } else toast.error((await res.json()).error || "Failed to save");
  };

  const handleDelete = async (room: Room) => {
    if (!confirm(`Delete room ${room.roomNumber}? This will also delete ${room._count.slots} associated time slots.`)) return;
    const res = await fetch(`/api/rooms/${room.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Room deleted"); fetchRooms(); notifyAnalyticsRefresh(); }
  };

  const handleImport = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/rooms/import", { method: "POST", body: formData });
    if (res.ok) { toast.success("Import queued"); setShowImport(false); setTimeout(fetchRooms, 2000); }
    else toast.error("Import failed");
  };

  return (
    <div className="page-section">
      <PageHeader
        title="Rooms"
        description={`${pagination.total} rooms`}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}><Upload size={14} /> Import</Button>
            <Button size="sm" onClick={() => { setEditing(null); setForm({ roomNumber: "", departmentId: departments[0]?.id || "", capacity: "", type: "CLASSROOM" }); setShowModal(true); }}>
              <Plus size={14} /> Add Room
            </Button>
          </>
        }
      />

      <SearchBar
        placeholder="Search rooms..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <DataTable
        loading={loading}
        data={rooms}
        keyExtractor={(r) => r.id}
        columns={[
          { key: "room", header: "Room", render: (r) => <span className="font-semibold">{r.roomNumber}</span> },
          { key: "dept", header: "Department", render: (r) => <span className="text-text-secondary">{r.department.name}</span> },
          { key: "type", header: "Type", render: (r) => <Badge variant={roomBadgeVariant(r.type)}>{r.type}</Badge> },
          {
            key: "capacity", header: "Capacity", align: "center",
            render: (r) => r.capacity === 0 ? (
              <span className="inline-flex items-center gap-1 text-warning"><AlertTriangle size={12} /> 0</span>
            ) : r.capacity,
          },
          { key: "slots", header: "Slots Used", align: "center", render: (r) => `${r._count.slots} / 54` },
          {
            key: "actions", header: "Actions", align: "right",
            render: (r) => (
              <div className="flex gap-1 justify-end">
                <IconButton onClick={() => { setEditing(r); setForm({ roomNumber: r.roomNumber, departmentId: "", capacity: String(r.capacity), type: r.type }); setShowModal(true); }}>
                  <Pencil size={14} />
                </IconButton>
                <IconButton variant="danger" onClick={() => handleDelete(r)}><Trash2 size={14} /></IconButton>
              </div>
            ),
          },
        ]}
      />
      <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))} />

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit Room" : "Add Room"}>
        <div className="space-y-4">
          <Input label="Room Number" value={form.roomNumber} onChange={(e) => setForm({ ...form, roomNumber: e.target.value })} />
          {!editing && (
            <Select label="Department" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
            </Select>
          )}
          <Input label="Capacity" type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
          <Select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="CLASSROOM">Classroom</option>
            <option value="LAB">Lab</option>
            <option value="OTHER">Other</option>
          </Select>
          <Button onClick={handleSave} className="w-full justify-center">{editing ? "Update" : "Create"}</Button>
        </div>
      </Modal>

      <Modal open={showImport} onClose={() => setShowImport(false)} title="Import Rooms">
        <BulkImport onUpload={handleImport} hint="Columns: roomNumber | departmentCode | capacity | type" />
      </Modal>
    </div>
  );
}
