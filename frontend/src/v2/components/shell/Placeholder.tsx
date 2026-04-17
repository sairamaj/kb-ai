interface Props {
  title: string
  description?: string
  children?: React.ReactNode
}

export function Placeholder({ title, description, children }: Props) {
  return (
    <div className="flex h-full w-full items-center justify-center px-6 text-center">
      <div className="max-w-md">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
        {description && (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{description}</p>
        )}
        {children}
      </div>
    </div>
  )
}
