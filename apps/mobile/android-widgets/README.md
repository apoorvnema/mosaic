# Android home-screen widgets (Kotlin + Glance)

Placeholder. The widgets are built in the Android session (Prompt 5).

They live inside the Tauri Android project, which Tauri generates at
`apps/mobile/src-tauri/gen/android` with `pnpm --filter @mosaic/mobile tauri android init`.
That needs the Android SDK and NDK, which the cloud dev environment does not have,
so the generated project is not committed yet — see docs/adr/0007.

The rule that will not change: every widget's data layer is a plain Kotlin class
with JVM unit tests, and the Glance UI on top of it stays thin. Widgets read the
local store, never wait on the network, and never show a spinner.
