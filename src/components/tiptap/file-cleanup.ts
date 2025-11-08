/**
 * Utility function for deleting files from Supabase storage
 */

/**
 * Deletes a file from Supabase storage
 * @param filePath - The file path to delete
 * @returns Promise that resolves when deletion is complete
 */
export async function deleteFileFromStorage(filePath: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/files/delete?path=${encodeURIComponent(filePath)}`, {
      method: 'DELETE',
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error(`Failed to delete file ${filePath}:`, errorData.error || response.statusText)
      return false
    }
    
    const result = await response.json()
    console.log(`Successfully deleted file: ${filePath}`)
    return result.success === true
    
  } catch (error) {
    console.error(`Error deleting file ${filePath}:`, error)
    return false
  }
}

/**
 * Deletes multiple files from Supabase storage
 * @param filePaths - Array of file paths to delete
 * @returns Promise that resolves when all deletions are complete
 */
export async function cleanupFiles(filePaths: string[]): Promise<void> {
  if (filePaths.length === 0) return
  
  const deletePromises = filePaths.map(path => deleteFileFromStorage(path))
  await Promise.allSettled(deletePromises)
}

// Keep cleanupImages for backward compatibility, but it's now just a wrapper
export async function cleanupImages(filePaths: string[]): Promise<void> {
  await cleanupFiles(filePaths)
}

// Keep deleteImageFromStorage for backward compatibility
export async function deleteImageFromStorage(filePath: string): Promise<boolean> {
  return deleteFileFromStorage(filePath)
}
