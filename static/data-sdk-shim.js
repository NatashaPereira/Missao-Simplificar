/*
 * Substitui o window.dataSdk do Canva Code por uma versão que fala
 * com a API Flask (banco SQLite real). Implementa a mesma interface
 * que o resto do código já usa: init(handler), create(obj),
 * update(obj), delete(obj) — assim quase nenhuma outra parte do
 * JavaScript precisa mudar.
 */
(function () {
  const API_URL = "/api/records";
  let dataHandler = null;

  async function fetchAll() {
    const res = await fetch(API_URL);
    if (!res.ok) return [];
    return res.json();
  }

  async function refreshAndNotify() {
    const data = await fetchAll();
    if (dataHandler && typeof dataHandler.onDataChanged === "function") {
      dataHandler.onDataChanged(data);
    }
    return data;
  }

  window.dataSdk = {
    async init(handler) {
      dataHandler = handler;
      try {
        await refreshAndNotify();
        return { isOk: true };
      } catch (err) {
        console.error("Erro ao inicializar dataSdk:", err);
        return { isError: true, message: String(err) };
      }
    },

    async create(record) {
      try {
        const res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(record),
        });
        const result = await res.json();
        await refreshAndNotify();
        if (!res.ok || result.isError) {
          return { isError: true, message: result.message || "Erro ao criar registro" };
        }
        return result;
      } catch (err) {
        console.error("Erro ao criar registro:", err);
        return { isError: true, message: String(err) };
      }
    },

    async update(record) {
      try {
        const id = record.__backendId;
        const res = await fetch(`${API_URL}/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(record),
        });
        const result = await res.json();
        await refreshAndNotify();
        if (!res.ok || result.isError) {
          return { isError: true, message: result.message || "Erro ao atualizar registro" };
        }
        return result;
      } catch (err) {
        console.error("Erro ao atualizar registro:", err);
        return { isError: true, message: String(err) };
      }
    },

    async delete(record) {
      try {
        const id = record.__backendId;
        const res = await fetch(`${API_URL}/${id}`, { method: "DELETE" });
        const result = await res.json();
        await refreshAndNotify();
        if (!res.ok) {
          return { isError: true, message: "Erro ao excluir registro" };
        }
        return result;
      } catch (err) {
        console.error("Erro ao excluir registro:", err);
        return { isError: true, message: String(err) };
      }
    },
  };
})();
