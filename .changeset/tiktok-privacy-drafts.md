---
"postfast-mcp": patch
---

TikTok: the `tiktokPrivacy` description and the server instructions no longer say that videos follow the account's default privacy and photos default to public, which doesn't hold for every post. They now say the field is deprecated and not to be relied on to choose who sees a post: a private post goes as a draft (`tiktokIsDraft: true`), whose audience is picked when it is finished in the TikTok app. `tiktokIsDraft` gains a description: TikTok drops the caption, hashtags and post settings of a video draft, and a photo draft keeps its title and caption. The social-media-post skill and the README say the same.
