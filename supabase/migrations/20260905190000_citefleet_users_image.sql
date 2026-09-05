-- Profile picture for console accounts.
--
-- Both providers already return one on the profile call CiteFleet makes -- Google
-- as `picture` on /oauth2/v2/userinfo, GitHub as `avatar_url` on /user -- and
-- both were being read and discarded, so signing in showed no face anywhere.
--
-- The URL is stored, not the image: these are provider-hosted CDN URLs that
-- change when the user changes their picture, and proxying them would mean
-- serving arbitrary remote bytes from our origin.
--
-- Nullable: email/password accounts have no provider and therefore no picture,
-- and a provider may return none.

ALTER TABLE citefleet_users ADD COLUMN IF NOT EXISTS image_url TEXT;
