import path from "node:path";

/**
 * Fora de public/ de propósito: o servidor de arquivos estáticos do Next em
 * produção monta a lista de arquivos de public/ na inicialização, então um
 * arquivo salvo ali DEPOIS do servidor subir só aparece após reiniciar — o
 * upload pareceria funcionar mas devolveria 404 até o próximo deploy. Servir
 * por uma rota de API própria (src/app/api/uploads/[...path]/route.ts) lê o
 * arquivo do disco a cada requisição, sem esse problema.
 */
export const UPLOADS_DIR = path.join(process.cwd(), "uploads", "products");
