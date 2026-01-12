declare module '*?worker&url' {
  const url: string
  export default url
}

declare module '*?worker' {
  class WorkerConstructor extends Worker {
    constructor(options?: WorkerOptions)
  }
  export default WorkerConstructor
}

declare module '*?worker&inline' {
  class WorkerConstructor extends Worker {
    constructor(options?: WorkerOptions)
  }
  export default WorkerConstructor
}