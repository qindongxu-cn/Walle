import { id as newId } from './id'

interface WorkerOutput<O> {
  id: string
  payload: O
  error?: boolean
  message?: string
}

export class WorkerManager<O = unknown> {
  #worker: Worker
  #resolvers = new Map<
    string,
    {
      resolve: (payload: O) => void
      reject: (e: Error) => void
    }
  >()

  constructor(workerURL: string, options: WorkerOptions = {}) {
    this.#worker = new Worker(workerURL, options)
    this.#worker.addEventListener('message', (ev: MessageEvent<WorkerOutput<O>>) => {
      const { id, payload, error, message = '' } = ev.data
      const resolver = this.#resolvers.get(id)
      if (!resolver) return
      if (error) {
        resolver.reject(new Error(message))
      } else {
        resolver.resolve(payload)
      }
      this.#resolvers.delete(id)
    })
  }

  processMessage = <I>(payload: I, transfer: Transferable[] = []) =>
    new Promise<O>((resolve, reject) => {
      const id = newId()
      this.#resolvers.set(id, { resolve, reject })
      this.#worker.postMessage(
        {
          payload,
          id
        },
        transfer
      )
    })
}
