

export class ArunaError {
    public readonly type: string
    public readonly message: string
    public readonly code: number

    constructor(code: number, message: string) {
        this.type = 'ArunaError'
        this.message = message
        this.code = code
    }
}
