const fs = require('fs')
const path = require('path')
const axios = require('./speed-limiter')
const cheerio = require('cheerio')

const bookID = '9783031594502'
const baseURL = `https://jigsaw.vitalsource.com/books/${bookID}/epub/`
const fsRelativePath = './epub/'

// Cookie value sent to jigsaw.vitalsource.com from the browser
// including: reese84 + jigsaw_session
const globalCookieVal = `RPpA5SCgHfrIzqSlQf4CQrbkRqD%2Fs3GudR1aNRxIoWPZssnKtIdmuO5xeSx7XngqzcSA9vEpXRj2k7gKbgwdLWTkEFbaGDAnytSwFVDVjafqbpjryUQfW1WMyiz763T5LeYS9KczuS1d%2FEJrltNe2wGCR8Zt4r578CF2eRQ%2B%2F2HnQcdkficnBXJCa%2B7xmP4KAldUvkt1bomo8ahl5OFhWa3Baq85rRXCI%2F%2BN8eYde%2BxtrETZMzrx7pWUkXjr6uNNQnnjSUlymOJf8e%2F4JhgeF%2Fkpx0EBuNG9A6WeerOnyKYp13zzzKx%2FtEwoX6VyHVV9sewIYVdEfNCnqpdwOvRVvOaX%2BAOwaSFQQG%2BE%2BItitpQSsuHoF45EiKHxSaagSdv%2BvFHlf2WehqrBQ4sht2BG5A%3D%3D--tkNpgpgiUpO5WtMC--ZaUqmNkBoHaEHCQfirhsMg%3D%3D`

const writeIntoFS = async (filepath, contents) => {
  const file = path.resolve(fsRelativePath, filepath)
  await fs.promises.mkdir(path.dirname(file), { recursive: true })
  await fs.promises.writeFile(file, contents)
  return file
}

const fetchXML = async epubPath => {
  const furl = baseURL + epubPath
  console.log(`Fetching ${furl}`)
  const { data } = await axios.request({
    url: furl,
    method: 'get',
    transformResponse: [d => d],
    responseType: 'text',
    headers: { Cookie: globalCookieVal }
  })
  const $ = cheerio.load(data)
  return { data: `<?xml version="1.0" encoding="UTF-8"?>` + data, $ }
}

const fetchURL = async epubPath => {
  const furl = baseURL + epubPath
  console.log(`Fetching ${furl}`)
  const { data } = await axios.request({
    url: furl,
    method: 'get',
    transformResponse: [d => d],
    responseType: 'arraybuffer',
    headers: { Cookie: globalCookieVal }
  })
  return data
}

// Specific Fetchers/extractors
const getContainer = async () => {
  const url = 'META-INF/container.xml'
  let packageOPF
  await fetchXML(url).then(async ({ data, $ }) => {
    packageOPF = $('rootfile').attr('full-path')
    if (!fs.existsSync(path.resolve(fsRelativePath, url))) {
      await writeIntoFS(url, Buffer.from(data, 'utf8'))
    }
  })
  return packageOPF
}

const getOPF = async () => {
  const url = 'OEBPS/package.opf' // big one
  let looperURLs = []
  await fetchXML(url).then(async ({ data, $ }) => {
    $('manifest [href]').each((i, el) => {
      const fip = 'OEBPS/' + $(el).attr('href')
      if (!fs.existsSync(path.resolve(fsRelativePath, fip))) looperURLs.push(fip)
    })

    if (!fs.existsSync(path.resolve(fsRelativePath, url))) {
      await writeIntoFS(url, Buffer.from(data, 'utf8'))
    }
  })
  return looperURLs
}

let completed = 0
let totalToRun = 0

const getAndSave = async (url) => {
  await fetchURL(url).then(async data => {
    await writeIntoFS(url, Buffer.from(data, 'binary'))
    completed += 1
    console.log(`${(completed / totalToRun * 100).toFixed(2)}%\t Saved ${url}`)
  })
  return true
}

const recursiveGet = async (arrayURLs) => {
  totalToRun = arrayURLs.length
  for (let i = 0; i < arrayURLs.length; i += 1) {
    getAndSave(arrayURLs[i])
  }
  return true
}

getContainer().then(getOPF).then(recursiveGet)
