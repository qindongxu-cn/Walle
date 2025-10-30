import { Subject } from 'rxjs'

/**
 * 发布订阅
 * @abstract
 */
export abstract class EventEmitter<M> {
  protected subjects = new Map<keyof M, Subject<M[keyof M]>>()

  subject = <K extends keyof M>(key: K) => {
    // 懒注册
    if (!this.subjects.has(key)) this.subjects.set(key, new Subject())
    return this.subjects.get(key) as unknown as Subject<M[K]>
  }

  protected subjectNext = <K extends keyof M>(key: K, ev: M[K]) => {
    const subject = this.subjects.get(key)
    if (!subject) return
    subject.next(ev)
  }

  protected unsubscribeAll = () => {
    this.subjects.forEach((subject) => {
      subject.unsubscribe()
    })
    this.subjects.clear()
  }
}
