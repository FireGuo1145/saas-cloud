import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { Badge, Button, Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, Label, api } from "@mirelia/dashboard/frontend";
import { Check, ChevronDown, Plus, ShieldCheck, UserRound, UsersRound, X } from "lucide-react";

type Permission = "view" | "edit" | "manage_members" | "manage_fields";
interface Member { id: number; username: string; email: string; permissions: Permission[]; isOwner: boolean }
interface AvailableUser { id: number; username: string; email: string }
interface MembersPayload { members: Member[]; availableUsers: AvailableUser[]; canManage: boolean }
const permissionOptions: Array<{ id: Permission; label: string; description: string }> = [
  { id: "view", label: "View project", description: "View project pages and details" },
  { id: "edit", label: "Edit project", description: "Change project name and description" },
  { id: "manage_fields", label: "Edit field values", description: "Update custom field values in this project" },
  { id: "manage_members", label: "Manage members", description: "Add members and change their permissions" },
];

export default function ProjectMembersPage() {
  const { id } = useParams();
  const [members, setMembers] = useState<Member[]>([]);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AvailableUser>();
  const [permissions, setPermissions] = useState<Permission[]>(["view"]);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!id) return;
    setError("");
    try {
      const { data } = await api.get<MembersPayload>(`/projects/${id}/members`);
      setMembers(data.members);
      setAvailableUsers(data.availableUsers);
      setCanManage(data.canManage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Project members could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [id]);

  function togglePermission(value: Permission, values: Permission[], update: (permissions: Permission[]) => void) {
    if (value === "view") return;
    const next = values.includes(value) ? values.filter((permission) => permission !== value) : [...values, value];
    update(next);
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || !selectedUser) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/projects/${id}/members`, { userId: selectedUser.id, permissions });
      setAddOpen(false);
      setSelectedUser(undefined);
      setPermissions(["view"]);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add project member.");
    } finally {
      setBusy(false);
    }
  }

  async function savePermissions(member: Member, next: Permission[]) {
    if (!id) return;
    setError("");
    try {
      await api.put(`/projects/${id}/members/${member.id}`, { permissions: next });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update member permissions.");
    }
  }

  async function removeMember(member: Member) {
    if (!id) return;
    setError("");
    try {
      await api.delete(`/projects/${id}/members/${member.id}`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove project member.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div><p className="mb-1 text-sm text-muted-foreground">Project access</p><h1 className="text-2xl font-semibold">Members</h1><p className="mt-1 text-sm text-muted-foreground">Manage who can access this project and what they can do.</p></div>
        {canManage && <Button onPress={() => setAddOpen(true)}><Plus />Add member</Button>}
      </div>
      {error && <div className="mt-5 flex flex-wrap items-center gap-3" role="alert"><p className="text-sm text-destructive">{error}</p><Button variant="outline" size="sm" onPress={() => { setLoading(true); void load(); }}>Retry</Button></div>}
      {loading ? <p className="mt-6 text-sm text-muted-foreground" role="status">Loading members...</p> : members.length ? <div className="mt-5 divide-y divide-border border-y border-border">
        {members.map((member) => <MemberRow key={member.id} member={member} editable={canManage && !member.isOwner} onSave={(next) => void savePermissions(member, next)} onRemove={() => void removeMember(member)} />)}
      </div> : <div className="mt-6 flex min-h-48 flex-col items-center justify-center border-y border-border text-center"><UsersRound className="mb-3 size-7 text-muted-foreground" /><h2 className="text-sm font-medium">No project members</h2></div>}
      <Dialog isOpen={addOpen} onOpenChange={setAddOpen}>
        <DialogHeader><DialogTitle>Add project member</DialogTitle><DialogDescription>Choose a user from this workspace and assign project permissions.</DialogDescription></DialogHeader>
        <form className="space-y-5" onSubmit={(event) => void addMember(event)}>
          <div className="space-y-2"><Label>Account</Label><DropdownMenuTrigger>
            <Button type="button" variant="outline" className="w-full justify-between">{selectedUser ? `${selectedUser.username} · ${selectedUser.email}` : "Select a user"}<ChevronDown /></Button>
            <DropdownMenu className="w-[var(--trigger-width)]"><DropdownMenuLabel>Available accounts</DropdownMenuLabel>
              {availableUsers.map((user) => <DropdownMenuItem key={user.id} onAction={() => setSelectedUser(user)}><UserRound className="size-4" /><span className="min-w-0 flex-1 truncate">{user.username} · {user.email}</span>{selectedUser?.id === user.id && <Check className="size-4" />}</DropdownMenuItem>)}
              {!availableUsers.length && <DropdownMenuItem isDisabled>No available users</DropdownMenuItem>}
            </DropdownMenu>
          </DropdownMenuTrigger></div>
          <div className="space-y-2"><Label>Permissions</Label><div className="divide-y divide-border border-y border-border">
            {permissionOptions.map((permission) => <PermissionToggle key={permission.id} option={permission} checked={permissions.includes(permission.id)} onPress={() => togglePermission(permission.id, permissions, setPermissions)} />)}
          </div></div>
          <DialogFooter><Button type="button" variant="outline" onPress={() => setAddOpen(false)}>Cancel</Button><Button type="submit" isDisabled={busy || !selectedUser}>{busy ? "Adding..." : "Add member"}</Button></DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}

function MemberRow({ member, editable, onSave, onRemove }: { member: Member; editable: boolean; onSave(next: Permission[]): void; onRemove(): void }) {
  const [editing, setEditing] = useState(false);
  const [permissions, setPermissions] = useState(member.permissions);
  useEffect(() => setPermissions(member.permissions), [member.permissions]);
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-muted text-sm font-medium text-muted-foreground"><UserRound className="size-4" /></span>
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-medium">{member.username}</span>{member.isOwner && <Badge variant="secondary"><ShieldCheck className="size-3" />Owner</Badge>}</div><p className="truncate text-xs text-muted-foreground">{member.email}</p></div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:max-w-[65%] sm:justify-end">
        {permissionOptions.map((permission) => <Button key={permission.id} type="button" size="sm" variant={permissions.includes(permission.id) ? "secondary" : "outline"} isDisabled={!editable || !editing || permission.id === "view"} aria-pressed={permissions.includes(permission.id)} onPress={() => togglePermission(permission.id, permissions, setPermissions)}>{permissions.includes(permission.id) ? <Check /> : null}{permission.label}</Button>)}
        {editable && <><Button type="button" size="sm" variant={editing ? "default" : "outline"} onPress={() => { if (editing) onSave(permissions); setEditing(!editing); }}>{editing ? "Save" : "Edit access"}</Button><Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${member.username}`} onPress={onRemove}><X /></Button></>}
      </div>
    </div>
  );
}

function PermissionToggle({ option, checked, onPress }: { option: typeof permissionOptions[number]; checked: boolean; onPress(): void }) {
  return <Button type="button" variant="ghost" className="h-auto min-h-14 w-full justify-start gap-3 rounded-none px-2 py-2 text-left whitespace-normal" aria-pressed={checked} onPress={onPress}>
    <span className={`grid size-4 shrink-0 place-items-center rounded border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>{checked && <Check className="size-3" />}</span>
    <span className="min-w-0"><span className="block text-sm font-medium">{option.label}</span><span className="block text-xs text-muted-foreground">{option.description}</span></span>
  </Button>;
}
