/** Binary assets bundled into the script as a data: URI (Vite's `?inline`). */
declare module '*.glb?inline' {
  const dataUri: string;
  export default dataUri;
}
declare module '*.png?inline' {
  const dataUri: string;
  export default dataUri;
}
declare module '*.jpg?inline' {
  const dataUri: string;
  export default dataUri;
}
