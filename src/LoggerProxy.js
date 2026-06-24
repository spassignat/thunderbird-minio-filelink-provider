
/*
 * Proxy Logger - Logge tous les appels de méthodes d'une classe
 */

/**
 * Crée un proxy qui logge tous les appels de méthodes d'un objet
 * @param {Object} target - L'objet à logger
 * @param {string} name - Nom de l'objet pour les logs
 * @param {Object} options - Options de logging
 * @returns {Proxy} - Le proxy avec logging
 */
function createMethodLogger(target, name = 'Object', options = {}) {
    const {
        logArgs = true,          // Logge les arguments
        logReturn = true,        // Logge la valeur de retour
        logTime = true,          // Logge le temps d'exécution
        logError = true,         // Logge les erreurs
        logAsync = true,         // Logge les promesses résolues
        filter = null,           // Filtre les méthodes à logger (regex ou fonction)
        prefix = ''              // Préfixe pour les logs
    } = options;

    // Fonction de logging
    function logMessage(...args) {
        console.log(`[${name}]${prefix ? ' ' + prefix : ''}`, ...args);
    }

    function logErrorMsg(...args) {
        console.error(`[${name}]${prefix ? ' ' + prefix : ''}`, ...args);
    }

    // Vérifie si la méthode doit être loggée
    function shouldLogMethod(methodName) {
        if (!filter) return true;
        if (typeof filter === 'function') {
            return filter(methodName);
        }
        if (filter instanceof RegExp) {
            return filter.test(methodName);
        }
        return true;
    }

    return new Proxy(target, {
        get(target, prop, receiver) {
            const value = Reflect.get(target, prop, receiver);

            // Si ce n'est pas une fonction, retourner la valeur normale
            if (typeof value !== 'function') {
                return value;
            }

            // Si c'est une fonction, la logger
            return function(...args) {
                const methodName = prop.toString();

                // Vérifier si on doit logger cette méthode
                if (!shouldLogMethod(methodName)) {
                    return Reflect.apply(value, target, args);
                }

                const startTime = logTime ? performance.now() : null;

                try {
                    // Log l'appel
                    const argsStr = logArgs ? args.map(a =>
                        typeof a === 'object' ? JSON.stringify(a) : String(a)
                    ).join(', ') : '...';

                    logMessage(`🔧 ${methodName}(${argsStr})`);

                    // Exécuter la méthode
                    const result = Reflect.apply(value, target, args);

                    // Gérer les promesses
                    if (result && typeof result.then === 'function' && logAsync) {
                        return result
                            .then(resolved => {
                                const elapsed = logTime ? (performance.now() - startTime).toFixed(2) : null;
                                if (logReturn) {
                                    logMessage(`✅ ${methodName}() retourné:`, resolved);
                                }
                                if (elapsed) {
                                    logMessage(`⏱️ ${methodName}() exécuté en ${elapsed}ms`);
                                }
                                return resolved;
                            })
                            .catch(error => {
                                const elapsed = logTime ? (performance.now() - startTime).toFixed(2) : null;
                                if (logError) {
                                    logErrorMsg(`❌ ${methodName}() erreur:`, error);
                                }
                                if (elapsed) {
                                    logMessage(`⏱️ ${methodName}() exécuté en ${elapsed}ms (avec erreur)`);
                                }
                                throw error;
                            });
                    }

                    // Résultat synchrone
                    const elapsed = logTime ? (performance.now() - startTime).toFixed(2) : null;
                    if (logReturn && result !== undefined) {
                        logMessage(`✅ ${methodName}() retourné:`, result);
                    }
                    if (elapsed) {
                        logMessage(`⏱️ ${methodName}() exécuté en ${elapsed}ms`);
                    }
                    return result;

                } catch (error) {
                    const elapsed = logTime ? (performance.now() - startTime).toFixed(2) : null;
                    if (logError) {
                        logErrorMsg(`❌ ${methodName}() erreur:`, error);
                    }
                    if (elapsed) {
                        logMessage(`⏱️ ${methodName}() exécuté en ${elapsed}ms (avec erreur)`);
                    }
                    throw error;
                }
            };
        }
    });
}

/**
 * Version simplifiée pour logger rapidement une classe
 */
function logClass(instance, name) {
    return createMethodLogger(instance, name, {
        logArgs: true,
        logReturn: true,
        logTime: true,
        logError: true,
        logAsync: true
    });
}

/**
 * Version silencieuse (seulement les appels, pas les retours)
 */
function logClassCalls(instance, name) {
    return createMethodLogger(instance, name, {
        logArgs: true,
        logReturn: false,
        logTime: false,
        logError: true,
        logAsync: false
    });
}
