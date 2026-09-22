# CiteFleet UI components

Read the repository `PRIME_DIRECTIVE.md` and root `AGENTS.md` first. This map
covers `src/components/citefleet/`; it describes source files, not live state.

| File | Purpose |
| --- | --- |
| `AGENTS.md` | This folder map. |
| `AssetPicker.tsx` | Asset selector for the top-up screen. |
| `BrandLogo.tsx` | Shared CiteFleet logo component. |
| `CampaignView.tsx` | Per-site dashboard, including origin setup, IndexNow submission, and task results. |
| `CommandBoard.tsx` | Site roster and onboarding form. |
| `ControlPlane.tsx` | Operator controls. |
| `Copy.tsx` | Copyable values and rows. |
| `DnsProviderPanel.tsx` | DNS proof and provider action panel. |
| `DnsProviderPicker.tsx` | DNS provider selector. |
| `FleetView.tsx` | Fleet status and bot actions. |
| `GrokHandoff.tsx` | Grok handoff display. |
| `OriginPackPanel.tsx` | Download and copy controls for origin files, including the IndexNow key file. |
| `PayQr.tsx` | Payment QR display. |
| `PayTrust.tsx` | Payment terms and trust information. |
| `ProviderPicker.tsx` | Hosting provider selector. |
| `PublicFooter.tsx` | Shared public footer. |
| `Quiz.tsx` | Training quiz UI. |
| `ShareApp.tsx` | App sharing action. |
| `Shell.tsx` | Signed-in navigation and page shell. |
| `training/` | Training UI assets; `Mocks.tsx` renders example screens. |

When a file here changes materially, update its row in this map.
