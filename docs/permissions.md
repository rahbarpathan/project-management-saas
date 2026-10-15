# SprintFlow Permission Matrix & Access Control Specification

This document defines the Role-Based Access Control (RBAC) model, the centralized permission matrix, and safety invariants enforced across SprintFlow.

---

## 1. Role Hierarchy

SprintFlow defines four distinct roles within a workspace:

| Role | Summary | Scope of Authority |
| :--- | :--- | :--- |
| **OWNER** | Workspace Creator / Principal | Full control over the workspace, projects, tasks, billing, and membership lifecycle (including deletion). |
| **ADMIN** | Workspace Administrator | Manages workspace configuration, projects, and non-owner members. Cannot modify or remove Owners. |
| **MEMBER** | Active Contributor | Creates and updates tasks, shifts task positions/statuses, creates comments. Cannot alter workspace settings or membership. |
| **VIEWER** | Stakeholder / Auditor | Read-only access across all workspace resources. Cannot create or edit tasks, comments, or settings. |

---

## 2. Central Permission Matrix

All permissions map directly to atomic actions enforced by the backend permission engine:

| Action | Description | VIEWER | MEMBER | ADMIN | OWNER |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `workspace:read` | View workspace metadata, stats, and projects | Yes | Yes | Yes | Yes |
| `workspace:update` | Update workspace name or slug | No | No | Yes | Yes |
| `workspace:delete` | Delete the workspace and cascade all data | No | No | No | **Yes** |
| `members:read` | List members and their assigned roles | Yes | Yes | Yes | Yes |
| `members:add` | Invite or add an existing user to workspace | No | No | Yes | Yes |
| `members:update` | Change a member's role | No | No | Yes* | Yes |
| `members:remove` | Remove a member from the workspace | No | No | Yes* | Yes |
| `projects:read` | View projects within the workspace | Yes | Yes | Yes | Yes |
| `projects:create` | Create a new project | No | No | Yes | Yes |
| `projects:update` | Edit project details or status | No | No | Yes | Yes |
| `projects:delete` | Delete a project | No | No | Yes | **Yes** |
| `tasks:read` | View tasks and task details | Yes | Yes | Yes | Yes |
| `tasks:create` | Create new tasks | No | Yes | Yes | Yes |
| `tasks:update` | Edit task attributes, assignees, or statuses | No | Yes | Yes | Yes |
| `tasks:delete` | Delete tasks | No | Yes | Yes | Yes |
| `comments:create` | Add comments on tasks | No | Yes | Yes | Yes |

*\*Subject to Member Management Guardrails below.*

---

## 3. Member Management Guardrails & Invariants

In addition to coarse-grained action checks, member modifications must satisfy the following safety rules:

1. **Admin Cannot Modify an Owner**:
   - An `ADMIN` cannot change the role of an `OWNER`.
   - An `ADMIN` cannot remove an `OWNER` from the workspace.
   - Attempting to do so returns **`403 Forbidden`**.
2. **Admin Cannot Create an Owner**:
   - Only existing `OWNER`s can promote another member to `OWNER`.
3. **Last Owner Protection**:
   - There must always be at least one `OWNER` in a workspace.
   - Attempting to delete or demote the sole remaining `OWNER` returns **`400 Bad Request`** with `Cannot remove or demote the last owner of the workspace`.
4. **Atomic Workspace Creation**:
   - When a user creates a workspace, the workspace record and the creator's `OWNER` membership record are written within a single database transaction.

---

## 4. Non-Member Access Control Decision: 404 Not Found

When an authenticated user requests a workspace resource (e.g., `GET /api/workspaces/:id` or `/members`) for which they are **not a member**, the API returns **`404 Not Found`** rather than `403 Forbidden`.

### Security Rationale:
- **Prevents Resource Enumeration**: Returning `403 Forbidden` explicitly discloses that a workspace with that ID or slug exists on the platform. Attackers could scan or guess UUIDs to map out organization footprints.
- **Tenant Boundary Isolation**: In a multi-tenant SaaS architecture, data that does not belong to a user's tenancy is treated as completely non-existent from their vantage point.
- **Zero Information Leakage**: Returning `404 Not Found` guarantees that unauthorized users cannot distinguish between a non-existent workspace and a private workspace belonging to another tenant.
