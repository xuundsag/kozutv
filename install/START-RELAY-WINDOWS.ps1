# kozuTV Discord helper - install once, then it runs on its own forever.
# It carries the relay inside itself (base64 below), so this single file is
# everything you need. No separate downloads, nothing to keep open.
#
# What it does:
#   1. writes the relay to %LOCALAPPDATA%\kozuTV\relay.mjs
#   2. registers a logon task (and restarts it if it ever stops)
#   3. starts it right now
#
# To undo everything:  powershell -File START-RELAY-WINDOWS.ps1 -Uninstall

param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$taskName = 'kozuTV Discord helper'
$dest = Join-Path $env:LOCALAPPDATA 'kozuTV'
$relayPath = Join-Path $dest 'relay.mjs'

function Say($text) { Write-Host $text }

if ($Uninstall) {
  Say ''
  Say '  Removing the kozuTV Discord helper...'
  schtasks /Delete /TN "$taskName" /F 2>$null | Out-Null
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*kozutv*relay.mjs*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Remove-Item -Recurse -Force $dest -ErrorAction SilentlyContinue
  Say '  Done. Discord presence is off until you run this file again.'
  Say ''
  Read-Host '  Press Enter to close'
  exit 0
}

Say ''
Say '  ================================================'
Say '    kozuTV  -  Discord helper setup'
Say '  ================================================'
Say ''

# ---------------------------------------------------------------- node check
$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) {
  Say '  Node.js is needed once. Opening the download page...'
  Start-Process 'https://nodejs.org/en/download'
  Say ''
  Say '  Install the "LTS" version (Next, Next, Install), then double-click'
  Say '  this file again. It only takes a couple of minutes.'
  Say ''
  Read-Host '  Press Enter to close'
  exit 1
}
Say "  Node.js found: $(& node --version)"

# ------------------------------------------------------------------ write it
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$payload = @'
IyEvdXNyL2Jpbi9lbnYgbm9kZQovLyBrb3p1VFYgRGlzY29yZCByZWxheSAtIHRoZSBzbWFsbCBsb2NhbCBoZWxwZXIgdGhhdCBs
ZXRzIHRoZSAqYnJvd3NlciogcHVibGlzaAovLyBSaWNoIFByZXNlbmNlIHRvIERpc2NvcmQncyBkZXNrdG9wIGNsaWVudC4KLy8K
Ly8gV2h5IGEgaGVscGVyIGlzIG5lZWRlZDogRGlzY29yZCBoYXMgbm8gY2xvdWQgZW5kcG9pbnQgZm9yIHByZXNlbmNlLiBUaGUK
Ly8gZGVza3RvcCBjbGllbnQgZXhwb3NlcyBpdCBvbiBhIGxvY2FsIElQQyBlbmRwb2ludCAobmFtZWQgcGlwZSBvbiBXaW5kb3dz
LAovLyAkWERHX1JVTlRJTUVfRElSL2Rpc2NvcmQtaXBjLU4gdW5peCBzb2NrZXQgZWxzZXdoZXJlKSBhbmQgbm90aGluZyBlbHNl
IGNhbgovLyByZWFjaCBpdC4gQSB3ZWIgcGFnZSBpbiBhbnkgYnJvd3NlciBjYW5ub3Qgb3BlbiB0aGF0IGVuZHBvaW50LCBzbyB0
aGUgcGFnZQovLyB0YWxrcyB0byB0aGlzIHJlbGF5IG92ZXIgd3M6Ly8xMjcuMC4wLjE6NjQ2MyBhbmQgdGhlIHJlbGF5IHBhc3Nl
cyB0aGUgZnJhbWVzCi8vIHN0cmFpZ2h0IHRocm91Z2ggdG8gdGhlIGNsaWVudC4KLy8KLy8gVGhpcyBpcyB0aGUgc2FtZSBjb25j
bHVzaW9uIExhc3RXYXZlIHJlYWNoZWQ6IHByZXNlbmNlIG11c3QgYmUgZGVsaXZlcmVkIGZyb20KLy8gdGhlIG1hY2hpbmUgdGhh
dCBydW5zIERpc2NvcmQuIExhc3RXYXZlIGNhbiBza2lwIHRoZSByZWxheSBiZWNhdXNlIGl0IGlzIGEKLy8gbmF0aXZlIGFwcCBs
aXZpbmcgb24gdGhhdCBtYWNoaW5lOyBhIHdlYnNpdGUgY2Fubm90LgovLwovLyBXaGF0IGl0IGRvZXMgTk9UIGRvOiBpdCBuZXZl
ciBzZWVzIGEgRGlzY29yZCBhY2NvdW50IHRva2VuLCBuZXZlciBhc2tzIGZvciBhCi8vIHBhc3N3b3JkLCBhbmQgaXQgY2Fubm90
IHNlbmQgYW55dGhpbmcgRGlzY29yZCBkb2VzIG5vdCBhY2NlcHQgZnJvbSBhbgovLyBvcmRpbmFyeSBhcHAuIEl0IG9ubHkgZm9y
d2FyZHMgdGhlIGZyYW1lcyB0aGUgcGFnZSBnaXZlcyBpdC4KLy8KLy8gVXNhZ2U6Ci8vICAgbm9kZSByZWxheS9rb3p1dHYtZGlz
Y29yZC1yZWxheS5tanMgICAgICAgICAgICAjIGxpc3RlbiBvbiAxMjcuMC4wLjE6NjQ2MwovLyAgIFBPUlQ9NzAwMCBub2RlIHJl
bGF5Ly4uLiAgICAgICAgICAgICAgICAgICAgICAgIyBkaWZmZXJlbnQgcG9ydAovLyAgIEFMTE9XX09SSUdJTj1odHRwczovL2tv
enV0di5ib25kIG5vZGUgcmVsYXkvLi4uICMgcmVzdHJpY3Qgd2hpY2ggc2l0ZSBtYXkgdXNlIGl0Ci8vCi8vIFJ1biBpdCBvbiB0
aGUgbWFjaGluZSB3aGVyZSB0aGUgRGlzY29yZCBkZXNrdG9wIGFwcCBpcyBydW5uaW5nIGFuZCBzaWduZWQgaW4uCgppbXBvcnQg
bmV0IGZyb20gJ25vZGU6bmV0JzsKaW1wb3J0IHBhdGggZnJvbSAnbm9kZTpwYXRoJzsKaW1wb3J0IG9zIGZyb20gJ25vZGU6b3Mn
OwppbXBvcnQgY3J5cHRvIGZyb20gJ25vZGU6Y3J5cHRvJzsKCmNvbnN0IFBPUlQgPSBOdW1iZXIocHJvY2Vzcy5lbnYuUE9SVCB8
fCA2NDYzKTsKY29uc3QgSE9TVCA9IHByb2Nlc3MuZW52LkhPU1QgfHwgJzEyNy4wLjAuMSc7CmNvbnN0IEFMTE9XX09SSUdJTiA9
IFN0cmluZyhwcm9jZXNzLmVudi5BTExPV19PUklHSU4gfHwgJycpLnRyaW0oKTsKCmZ1bmN0aW9uIGlwY0NhbmRpZGF0ZXMoKSB7
CiAgY29uc3QgbGlzdCA9IFtdOwogIGNvbnN0IGFkZCA9IGJhc2UgPT4geyBmb3IgKGxldCBpID0gMDsgaSA8IDEwOyBpKyspIGxp
c3QucHVzaChwYXRoLmpvaW4oYmFzZSwgYGRpc2NvcmQtaXBjLSR7aX1gKSk7IH07CiAgaWYgKHByb2Nlc3MucGxhdGZvcm0gPT09
ICd3aW4zMicpIHsKICAgIGZvciAobGV0IGkgPSAwOyBpIDwgMTA7IGkrKykgbGlzdC5wdXNoKGBcXFxcP1xccGlwZVxcZGlzY29y
ZC1pcGMtJHtpfWApOwogICAgcmV0dXJuIGxpc3Q7CiAgfQogIGZvciAoY29uc3QgZGlyIG9mIFtwcm9jZXNzLmVudi5YREdfUlVO
VElNRV9ESVIsIHByb2Nlc3MuZW52LlRNUERJUiwgcHJvY2Vzcy5lbnYuVE1QLCBwcm9jZXNzLmVudi5URU1QLCAnL3RtcCddKSB7
CiAgICBpZiAoZGlyKSBhZGQoZGlyKTsKICB9CiAgYWRkKHBhdGguam9pbihvcy5ob21lZGlyKCksICcuZmxhdHBhay9kZXYuZGlz
Y29yZC5EaXNjb3JkL3hkZy1ydW4nKSk7CiAgYWRkKHBhdGguam9pbihvcy5ob21lZGlyKCksICcudmFyL2FwcC9jb20uZGlzY29y
ZGFwcC5EaXNjb3JkL3hkZy1ydW4nKSk7CiAgcmV0dXJuIFsuLi5uZXcgU2V0KGxpc3QpXTsKfQoKZnVuY3Rpb24gdHJ5Q29ubmVj
dCh0YXJnZXQpIHsKICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7CiAgICBjb25zdCBzb2NrZXQgPSBuZXQuY3JlYXRl
Q29ubmVjdGlvbih0YXJnZXQpOwogICAgY29uc3QgZG9uZSA9IG9rID0+IHsKICAgICAgc29ja2V0LnJlbW92ZUFsbExpc3RlbmVy
cygpOwogICAgICBpZiAob2spIHJlc29sdmUoc29ja2V0KTsKICAgICAgZWxzZSB7IHRyeSB7IHNvY2tldC5kZXN0cm95KCk7IH0g
Y2F0Y2gge30gcmVzb2x2ZShudWxsKTsgfQogICAgfTsKICAgIHNvY2tldC5vbmNlKCdjb25uZWN0JywgKCkgPT4gZG9uZSh0cnVl
KSk7CiAgICBzb2NrZXQub25jZSgnZXJyb3InLCAoKSA9PiBkb25lKGZhbHNlKSk7CiAgICBzZXRUaW1lb3V0KCgpID0+IGRvbmUo
ZmFsc2UpLCA4MDApOwogIH0pOwp9Cgphc3luYyBmdW5jdGlvbiBjb25uZWN0RGlzY29yZCgpIHsKICBmb3IgKGNvbnN0IGNhbmRp
ZGF0ZSBvZiBpcGNDYW5kaWRhdGVzKCkpIHsKICAgIGNvbnN0IHNvY2tldCA9IGF3YWl0IHRyeUNvbm5lY3QoY2FuZGlkYXRlKTsK
ICAgIGlmIChzb2NrZXQpIHJldHVybiBzb2NrZXQ7CiAgfQogIHJldHVybiBudWxsOwp9CgovLyAtLS0tLS0tLS0tLS0tLS0tLS0t
LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIHdzIHBsdW1iaW5nCmZ1bmN0aW9uIGFjY2VwdEtl
eShrZXkpIHsKICByZXR1cm4gY3J5cHRvLmNyZWF0ZUhhc2goJ3NoYTEnKS51cGRhdGUoa2V5ICsgJzI1OEVBRkE1LUU5MTQtNDdE
QS05NUNBLUM1QUIwREM4NUIxMScpLmRpZ2VzdCgnYmFzZTY0Jyk7Cn0KCmZ1bmN0aW9uIGZyYW1lKG9wY29kZSwgcGF5bG9hZCkg
ewogIGNvbnN0IGJvZHkgPSBCdWZmZXIuZnJvbShwYXlsb2FkKTsKICBjb25zdCBoZWFkID0gYm9keS5sZW5ndGggPCAxMjYKICAg
ID8gQnVmZmVyLmZyb20oWzB4ODAgfCBvcGNvZGUsIGJvZHkubGVuZ3RoXSkKICAgIDogQnVmZmVyLmZyb20oWzB4ODAgfCBvcGNv
ZGUsIDEyNiwgYm9keS5sZW5ndGggPj4gOCwgYm9keS5sZW5ndGggJiAweGZmXSk7CiAgcmV0dXJuIEJ1ZmZlci5jb25jYXQoW2hl
YWQsIGJvZHldKTsKfQoKZnVuY3Rpb24gcmVhZEZyYW1lcyhzdGF0ZSkgewogIGNvbnN0IG91dCA9IFtdOwogIGxldCBidWYgPSBz
dGF0ZS5idWZmZXI7CiAgZm9yICg7OykgewogICAgaWYgKGJ1Zi5sZW5ndGggPCAyKSBicmVhazsKICAgIGNvbnN0IG9wY29kZSA9
IGJ1ZlswXSAmIDB4MGY7CiAgICBjb25zdCBtYXNrZWQgPSAoYnVmWzFdICYgMHg4MCkgIT09IDA7CiAgICBsZXQgbGVuZ3RoID0g
YnVmWzFdICYgMHg3ZjsKICAgIGxldCBvZmZzZXQgPSAyOwogICAgaWYgKGxlbmd0aCA9PT0gMTI2KSB7CiAgICAgIGlmIChidWYu
bGVuZ3RoIDwgNCkgYnJlYWs7CiAgICAgIGxlbmd0aCA9IGJ1Zi5yZWFkVUludDE2QkUoMik7CiAgICAgIG9mZnNldCA9IDQ7CiAg
ICB9IGVsc2UgaWYgKGxlbmd0aCA9PT0gMTI3KSB7CiAgICAgIGlmIChidWYubGVuZ3RoIDwgMTApIGJyZWFrOwogICAgICBsZW5n
dGggPSBOdW1iZXIoYnVmLnJlYWRCaWdVSW50NjRCRSgyKSk7CiAgICAgIG9mZnNldCA9IDEwOwogICAgfQogICAgY29uc3QgbWFz
a0J5dGVzID0gbWFza2VkID8gNCA6IDA7CiAgICBpZiAoYnVmLmxlbmd0aCA8IG9mZnNldCArIG1hc2tCeXRlcyArIGxlbmd0aCkg
YnJlYWs7CiAgICBjb25zdCBtYXNrID0gbWFza2VkID8gYnVmLnN1YmFycmF5KG9mZnNldCwgb2Zmc2V0ICsgNCkgOiBudWxsOwog
ICAgY29uc3QgZGF0YSA9IEJ1ZmZlci5mcm9tKGJ1Zi5zdWJhcnJheShvZmZzZXQgKyBtYXNrQnl0ZXMsIG9mZnNldCArIG1hc2tC
eXRlcyArIGxlbmd0aCkpOwogICAgaWYgKG1hc2spIGZvciAobGV0IGkgPSAwOyBpIDwgZGF0YS5sZW5ndGg7IGkrKykgZGF0YVtp
XSBePSBtYXNrW2kgJSA0XTsKICAgIG91dC5wdXNoKHsgb3Bjb2RlLCBkYXRhIH0pOwogICAgYnVmID0gYnVmLnN1YmFycmF5KG9m
ZnNldCArIG1hc2tCeXRlcyArIGxlbmd0aCk7CiAgfQogIHN0YXRlLmJ1ZmZlciA9IGJ1ZjsKICByZXR1cm4gb3V0Owp9Cgpjb25z
dCBzZXJ2ZXIgPSBuZXQuY3JlYXRlU2VydmVyKGNsaWVudCA9PiB7CiAgbGV0IG9wZW5lZCA9IGZhbHNlOwogIGNvbnN0IHN0YXRl
ID0geyBidWZmZXI6IEJ1ZmZlci5hbGxvYygwKSB9OwogIGxldCBkaXNjb3JkID0gbnVsbDsKCiAgY29uc3QgbG9nID0gKC4uLmFy
Z3MpID0+IGNvbnNvbGUubG9nKG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zbGljZSgxMSwgMTkpLCAuLi5hcmdzKTsKCiAgY2xp
ZW50Lm9uKCdkYXRhJywgYXN5bmMgY2h1bmsgPT4gewogICAgaWYgKCFvcGVuZWQpIHsKICAgICAgY29uc3QgdGV4dCA9IGNodW5r
LnRvU3RyaW5nKCdsYXRpbjEnKTsKICAgICAgY29uc3QgZW5kID0gdGV4dC5pbmRleE9mKCdcclxuXHJcbicpOwogICAgICBpZiAo
ZW5kID09PSAtMSkgcmV0dXJuOwogICAgICBjb25zdCBoZWFkZXJzID0gT2JqZWN0LmZyb21FbnRyaWVzKHRleHQuc2xpY2UoMCwg
ZW5kKS5zcGxpdCgnXHJcbicpLnNsaWNlKDEpLm1hcChsaW5lID0+IHsKICAgICAgICBjb25zdCBpID0gbGluZS5pbmRleE9mKCc6
Jyk7CiAgICAgICAgcmV0dXJuIFtsaW5lLnNsaWNlKDAsIGkpLnRvTG93ZXJDYXNlKCkudHJpbSgpLCBsaW5lLnNsaWNlKGkgKyAx
KS50cmltKCldOwogICAgICB9KSk7CiAgICAgIGNvbnN0IG9yaWdpbiA9IGhlYWRlcnMub3JpZ2luIHx8ICcnOwogICAgICBpZiAo
QUxMT1dfT1JJR0lOICYmIG9yaWdpbiAmJiBvcmlnaW4gIT09IEFMTE9XX09SSUdJTikgewogICAgICAgIGNsaWVudC5lbmQoJ0hU
VFAvMS4xIDQwMyBGb3JiaWRkZW5cclxuQ29udGVudC1MZW5ndGg6IDBcclxuXHJcbicpOwogICAgICAgIGxvZygncmVqZWN0ZWQg
b3JpZ2luJywgb3JpZ2luKTsKICAgICAgICByZXR1cm47CiAgICAgIH0KICAgICAgY29uc3Qga2V5ID0gaGVhZGVyc1snc2VjLXdl
YnNvY2tldC1rZXknXTsKICAgICAgaWYgKCFrZXkpIHsgY2xpZW50LmVuZCgnSFRUUC8xLjEgNDAwIEJhZCBSZXF1ZXN0XHJcbkNv
bnRlbnQtTGVuZ3RoOiAwXHJcblxyXG4nKTsgcmV0dXJuOyB9CiAgICAgIGNsaWVudC53cml0ZSgKICAgICAgICAnSFRUUC8xLjEg
MTAxIFN3aXRjaGluZyBQcm90b2NvbHNcclxuJyArCiAgICAgICAgJ1VwZ3JhZGU6IHdlYnNvY2tldFxyXG5Db25uZWN0aW9uOiBV
cGdyYWRlXHJcbicgKwogICAgICAgIGBTZWMtV2ViU29ja2V0LUFjY2VwdDogJHthY2NlcHRLZXkoa2V5KX1cclxuXHJcbmAKICAg
ICAgKTsKICAgICAgb3BlbmVkID0gdHJ1ZTsKICAgICAgbG9nKCdwYWdlIGNvbm5lY3RlZCcsIG9yaWdpbiB8fCAnKG5vIG9yaWdp
biknKTsKICAgICAgcmV0dXJuOwogICAgfQoKICAgIHN0YXRlLmJ1ZmZlciA9IEJ1ZmZlci5jb25jYXQoW3N0YXRlLmJ1ZmZlciwg
Y2h1bmtdKTsKICAgIGZvciAoY29uc3QgaW5jb21pbmcgb2YgcmVhZEZyYW1lcyhzdGF0ZSkpIHsKICAgICAgaWYgKGluY29taW5n
Lm9wY29kZSA9PT0gMHg4KSB7IGNsaWVudC5lbmQoKTsgcmV0dXJuOyB9CiAgICAgIGlmIChpbmNvbWluZy5vcGNvZGUgIT09IDB4
MiAmJiBpbmNvbWluZy5vcGNvZGUgIT09IDB4MSkgY29udGludWU7CiAgICAgIGNvbnN0IGJvZHkgPSBCdWZmZXIuZnJvbShpbmNv
bWluZy5kYXRhKTsKICAgICAgaWYgKGJvZHkubGVuZ3RoIDwgOCkgY29udGludWU7CiAgICAgIGNvbnN0IG9wID0gYm9keS5yZWFk
VUludDMyTEUoMCk7CiAgICAgIGNvbnN0IGxlbmd0aCA9IGJvZHkucmVhZFVJbnQzMkxFKDQpOwogICAgICBjb25zdCBqc29uID0g
Ym9keS5zdWJhcnJheSg4LCA4ICsgbGVuZ3RoKTsKCiAgICAgIGlmIChvcCA9PT0gMCkgewogICAgICAgIC8vIGhhbmRzaGFrZTog
b3BlbiBhIGZyZXNoIERpc2NvcmQgY29ubmVjdGlvbiBmb3IgdGhpcyBwYWdlCiAgICAgICAgZGlzY29yZCA9IGF3YWl0IGNvbm5l
Y3REaXNjb3JkKCk7CiAgICAgICAgaWYgKCFkaXNjb3JkKSB7CiAgICAgICAgICBsb2coJ25vIERpc2NvcmQgZGVza3RvcCBjbGll
bnQgZm91bmQnKTsKICAgICAgICAgIGNsaWVudC53cml0ZShmcmFtZSgweDgsICcnKSk7CiAgICAgICAgICByZXR1cm47CiAgICAg
ICAgfQogICAgICAgIGxvZygncmVsYXlpbmcgdG8nLCAnZGlzY29yZC1pcGMnKTsKICAgICAgICBkaXNjb3JkLm9uKCdkYXRhJywg
ZGF0YSA9PiB7CiAgICAgICAgICBpZiAoY2xpZW50LmRlc3Ryb3llZCkgcmV0dXJuOwogICAgICAgICAgY2xpZW50LndyaXRlKGZy
YW1lKDB4MiwgZGF0YSkpOwogICAgICAgIH0pOwogICAgICAgIGRpc2NvcmQub24oJ2Nsb3NlJywgKCkgPT4gewogICAgICAgICAg
bG9nKCdEaXNjb3JkIGNsb3NlZCB0aGUgY29ubmVjdGlvbicpOwogICAgICAgICAgaWYgKCFjbGllbnQuZGVzdHJveWVkKSBjbGll
bnQud3JpdGUoZnJhbWUoMHg4LCAnJykpOwogICAgICAgIH0pOwogICAgICB9CiAgICAgIGlmICghZGlzY29yZCkgY29udGludWU7
CiAgICAgIHRyeSB7CiAgICAgICAgZGlzY29yZC53cml0ZShib2R5KTsKICAgICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgICBs
b2coJ3dyaXRlIGZhaWxlZDonLCBlcnJvci5tZXNzYWdlKTsKICAgICAgfQogICAgfQogIH0pOwoKICBjb25zdCBjbGVhbnVwID0g
KCkgPT4gewogICAgaWYgKGRpc2NvcmQpIHsgdHJ5IHsgZGlzY29yZC5kZXN0cm95KCk7IH0gY2F0Y2gge30gZGlzY29yZCA9IG51
bGw7IH0KICB9OwogIGNsaWVudC5vbignY2xvc2UnLCBjbGVhbnVwKTsKICBjbGllbnQub24oJ2Vycm9yJywgY2xlYW51cCk7Cn0p
OwoKc2VydmVyLmxpc3RlbihQT1JULCBIT1NULCAoKSA9PiB7CiAgY29uc29sZS5sb2coYGtvenV0di1kaXNjb3JkLXJlbGF5IGxp
c3RlbmluZyBvbiB3czovLyR7SE9TVH06JHtQT1JUfWApOwogIGNvbnNvbGUubG9nKEFMTE9XX09SSUdJTiA/IGBvbmx5IGFjY2Vw
dGluZyBwYWdlcyBmcm9tICR7QUxMT1dfT1JJR0lOfWAgOiAnYWNjZXB0aW5nIHBhZ2VzIGZyb20gYW55IG9yaWdpbiAoc2V0IEFM
TE9XX09SSUdJTiB0byByZXN0cmljdCknKTsKICBjb25zb2xlLmxvZygndGhlIERpc2NvcmQgZGVza3RvcCBhcHAgbXVzdCBiZSBy
dW5uaW5nIGFuZCBzaWduZWQgaW4gb24gdGhpcyBtYWNoaW5lJyk7Cn0pOwo=
'@
$bytes = [Convert]::FromBase64String(($payload -replace '\s', ''))
[IO.File]::WriteAllBytes($relayPath, $bytes)
Say '  Helper written to:'
Say "    $relayPath"

# ------------------------------------------------------------------- task it
schtasks /Delete /TN "$taskName" /F 2>$null | Out-Null
$action = "`"$($node.Source)`" `"$relayPath`""
$created = $false
schtasks /Create /TN "$taskName" /TR $action /SC ONLOGON /RL LIMITED /F 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { $created = $true }
if (-not $created) {
  # fall back to the Startup folder - works even when task creation is blocked
  $startup = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
  New-Item -ItemType Directory -Force -Path $startup | Out-Null
  $cmd = Join-Path $dest 'start-kozutv-helper.cmd'
  Set-Content -Path $cmd -Encoding ASCII -Value "@echo off`r`nstart `"`" /min `"$($node.Source)`" `"$relayPath`""
  Copy-Item $cmd (Join-Path $startup 'kozutv-discord-helper.cmd') -Force
  Say '  Added to your Startup folder (runs when you sign in).'
} else {
  Say '  Scheduled to start automatically every time you sign in.'
}

# keep it alive even if it stops
schtasks /Create /TN "$taskName keepalive" /TR $action /SC MINUTE /MO 5 /RL LIMITED /F 2>$null | Out-Null

# --------------------------------------------------------------- run it now
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*kozutv*relay.mjs*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Process -FilePath $node.Source -ArgumentList "`"$relayPath`"" -WindowStyle Hidden
Start-Sleep -Seconds 2

# -------------------------------------------------------------------- verify
$listening = $false
try {
  $client = New-Object Net.Sockets.TcpClient
  $client.Connect('127.0.0.1', 6463)
  $listening = $client.Connected
  $client.Close()
} catch { $listening = $false }

Say ''
if ($listening) {
  Say '  Ready. The helper is running in the background.'
  Say '  It starts by itself every time you sign in - you never have to'
  Say '  touch it again.'
  Say ''
  Say '  Now reload kozutv.bond and watch something.'
} else {
  Say '  Hmm, the helper did not answer on 127.0.0.1:6463.'
  Say '  Try running this file again, or tell me and I will look at it.'
}
Say ''
Read-Host '  Press Enter to close'
