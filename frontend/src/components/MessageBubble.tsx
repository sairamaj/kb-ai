import type { Components } from 'react-markdown'
import Markdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { Message } from '../types/chat'

interface Props {
  message: Message
}

function markdownComponents(isUser: boolean): Components {
  if (isUser) {
    return {
      h1: ({ children }) => (
        <h1 className="text-base font-bold mt-3 mb-1 first:mt-0">{children}</h1>
      ),
      h2: ({ children }) => (
        <h2 className="text-[0.95rem] font-bold mt-2.5 mb-1 first:mt-0">{children}</h2>
      ),
      h3: ({ children }) => (
        <h3 className="text-sm font-semibold mt-2 mb-0.5 first:mt-0">{children}</h3>
      ),
      p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
      ul: ({ children }) => <ul className="my-2 list-disc pl-5 first:mt-0">{children}</ul>,
      ol: ({ children }) => <ol className="my-2 list-decimal pl-5 first:mt-0">{children}</ol>,
      li: ({ children }) => <li className="my-0.5">{children}</li>,
      a: ({ href, children }) => (
        <a
          href={href}
          className="text-indigo-100 underline decoration-indigo-200/80 underline-offset-2 hover:text-white"
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      ),
      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
      em: ({ children }) => <em className="italic">{children}</em>,
      code: ({ className, children, ...props }) => {
        const isBlock = className?.includes('language-')
        if (isBlock) {
          return (
            <code className={className} {...props}>
              {children}
            </code>
          )
        }
        return (
          <code
            className="rounded bg-white/20 px-1 py-0.5 text-[0.9em] font-mono before:content-none after:content-none"
            {...props}
          >
            {children}
          </code>
        )
      },
      pre: ({ children }) => (
        <pre className="my-2 overflow-x-auto rounded-lg bg-black/25 p-3 text-xs leading-relaxed first:mt-0">
          {children}
        </pre>
      ),
      blockquote: ({ children }) => (
        <blockquote className="my-2 border-l-4 border-white/35 pl-3 italic first:mt-0">
          {children}
        </blockquote>
      ),
      hr: () => <hr className="my-3 border-white/30" />,
      table: ({ children }) => (
        <div className="my-2 max-w-full overflow-x-auto first:mt-0">
          <table className="w-full border-collapse text-xs">{children}</table>
        </div>
      ),
      thead: ({ children }) => <thead className="border-b border-white/25">{children}</thead>,
      th: ({ children }) => (
        <th className="border border-white/20 bg-white/10 px-2 py-1.5 text-left font-semibold">
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td className="border border-white/15 px-2 py-1.5 align-top">{children}</td>
      ),
      img: ({ src, alt }) => (
        <img src={src} alt={alt ?? ''} className="my-2 max-h-64 max-w-full rounded-md" loading="lazy" />
      ),
    }
  }

  return {
    h1: ({ children }) => (
      <h1 className="text-base font-bold text-gray-900 dark:text-gray-100 mt-3 mb-1 first:mt-0">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-[0.95rem] font-bold text-gray-900 dark:text-gray-100 mt-2.5 mb-1 first:mt-0">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-2 mb-0.5 first:mt-0">
        {children}
      </h3>
    ),
    p: ({ children }) => (
      <p className="my-1.5 text-gray-900 dark:text-gray-100 first:mt-0 last:mb-0">{children}</p>
    ),
    ul: ({ children }) => (
      <ul className="my-2 list-disc pl-5 text-gray-900 dark:text-gray-100 first:mt-0">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="my-2 list-decimal pl-5 text-gray-900 dark:text-gray-100 first:mt-0">{children}</ol>
    ),
    li: ({ children }) => <li className="my-0.5">{children}</li>,
    a: ({ href, children }) => (
      <a
        href={href}
        className="font-medium text-indigo-600 underline decoration-indigo-400/70 underline-offset-2 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    ),
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    code: ({ className, children, ...props }) => {
      const isBlock = className?.includes('language-')
      if (isBlock) {
        return (
          <code className={className} {...props}>
            {children}
          </code>
        )
      }
      return (
        <code
          className="rounded bg-gray-200 px-1 py-0.5 text-[0.9em] font-mono text-gray-900 before:content-none after:content-none dark:bg-gray-700 dark:text-gray-100"
          {...props}
        >
          {children}
        </code>
      )
    },
    pre: ({ children }) => (
      <pre className="my-2 overflow-x-auto rounded-lg bg-gray-200 p-3 text-xs leading-relaxed text-gray-900 first:mt-0 dark:bg-gray-900/60 dark:text-gray-100">
        {children}
      </pre>
    ),
    blockquote: ({ children }) => (
      <blockquote className="my-2 border-l-4 border-gray-300 pl-3 italic text-gray-700 first:mt-0 dark:border-gray-600 dark:text-gray-300">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="my-3 border-gray-200 dark:border-gray-700" />,
    table: ({ children }) => (
      <div className="my-2 max-w-full overflow-x-auto first:mt-0">
        <table className="w-full border-collapse text-xs text-gray-900 dark:text-gray-100">{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="border-b border-gray-200 dark:border-gray-600">{children}</thead>
    ),
    th: ({ children }) => (
      <th className="border border-gray-200 bg-gray-50 px-2 py-1.5 text-left font-semibold dark:border-gray-600 dark:bg-gray-800">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border border-gray-200 px-2 py-1.5 align-top dark:border-gray-600">{children}</td>
    ),
    img: ({ src, alt }) => (
      <img src={src} alt={alt ?? ''} className="my-2 max-h-64 max-w-full rounded-md" loading="lazy" />
    ),
  }
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold mr-2 mt-1">
          AI
        </div>
      )}

      <div
        className={`
          max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words
          ${isUser
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm'
          }
        `}
      >
        <div className="min-w-0 [&_.task-list-item]:list-none [&_input[type=checkbox]]:mr-1.5">
          <Markdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            components={markdownComponents(isUser)}
          >
            {message.content}
          </Markdown>
        </div>
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-400 dark:bg-gray-600 flex items-center justify-center text-xs font-bold ml-2 mt-1">
          You
        </div>
      )}
    </div>
  )
}
