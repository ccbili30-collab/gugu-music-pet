// NeteaseCloudMusicApi 为无类型的 CJS 包，此处只声明本项目用到的函数（全部返回 {status, body, cookie}）
declare module 'NeteaseCloudMusicApi' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type ApiFn = (params?: Record<string, any>) => Promise<any>
  export const register_anonimous: ApiFn
  export const login_qr_key: ApiFn
  export const login_qr_create: ApiFn
  export const login_qr_check: ApiFn
  export const login_status: ApiFn
  export const cloudsearch: ApiFn
  export const song_url_v1: ApiFn
  export const song_detail: ApiFn
  export const comment_music: ApiFn
  export const lyric_new: ApiFn
  export const personalized_newsong: ApiFn
}
