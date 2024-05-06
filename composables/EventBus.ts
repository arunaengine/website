class EventBus {
    events: {[key: string]: any};

    constructor() {
        this.events = {};
    }

    on(eventName: string, fn?: any) {
        this.events[eventName] = this.events[eventName] || [];
        this.events[eventName].push(fn);
    }

    off(eventName: string, fn?: any) {
        if (this.events[eventName]) {
            for (let i = 0; i < this.events[eventName].length; i++) {
                if (this.events[eventName][i] === fn) {
                    this.events[eventName].splice(i, 1);
                    break;
                }
            }
        }
    }

    emit(eventName: string, data?: any) {
        if (this.events[eventName]) {
            this.events[eventName].forEach(function (fn: any) {
                fn(data);
            })
        }
    }
}

// Singleton instance used by every component.
export default new EventBus();