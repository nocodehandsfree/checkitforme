# Admin cleanup: Policy (godview › growth)

**What:** Clean the Policy page of the Admin (group godview, section growth): match ADMIN_COMPS.dc.html + STYLE_GUIDE §3 + the admin copy guide; kill dead controls and stale numbers. Admin is the open construction zone — ship via scripts/ship-admin.sh.
**Done when:** The Policy page matches its comp/page-type, tooltips read plain, and the owner can drive it on THE Admin.
**Lane:** Addie
**Status:** DONE 07-29 (`0f2b6b7e`) — Policy is console grammar, tooltips read plain, driven on THE
Admin at 390px. Proof + what stays vs what moved: `admin-audit-policy-overload.md` and
`addie-dashboard-continue.md`.

**Verify-live output (paste on close — a task without it is NOT closed):**
```
staging  https://staging.checkitforme.com/ -> the code (0f2b6b7e) went live at push
admin    shell override c46b1a82, server 55badd886004 (rides the promote)
```
