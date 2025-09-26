
const debugKeyMap = new Map<string, any>();

/**
 * 比對 key 中的 compareValue 是否吻合，執行 callback function
 * 此命令必須在 DEBUG_MODE 有啟用的情形下才會執行 callback
 * @param key 
 * @param compareValue 
 * @param callback 
 */
function execute(key:string , compareValue: string , callback: Function) {
    if (!process.env.DEBUG_MODE) {
        return false
    }

    const v = debugKeyMap.get(key);
    if(v && v === compareValue) {
        callback();
    }
}

/**
 * 設定一個 key 的內容
 * @param key 
 * @param value 
 */
function setKey(key:string , value:string) {
    debugKeyMap.set(key , value);
}

export { execute , setKey};

