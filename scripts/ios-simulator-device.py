"""Choose a device the installed runtime actually supports (including iOS 27.1 Duo-only runtimes)."""
import json
import sys

preferred = ["iPhone 17", "iPhone 16", "iPhone 15"]
candidates = []
for runtime in json.load(sys.stdin)["runtimes"]:
    if not runtime.get("isAvailable") or "SimRuntime.iOS" not in runtime["identifier"]:
        continue
    for device in runtime.get("supportedDeviceTypes", []):
        if device.get("productFamily") != "iPhone":
            continue
        rank = preferred.index(device["name"]) if device["name"] in preferred else len(preferred)
        candidates.append((rank, runtime["identifier"], device["identifier"]))
if not candidates:
    sys.exit("No available iOS runtime with a compatible iPhone")
_, runtime_id, device_id = sorted(candidates)[0]
print(runtime_id, device_id)
