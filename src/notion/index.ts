import { Client } from "@notionhq/client"

// https://www.notion.so/IPSC-score-d18d67a940fb4a999be3b055513a5ada?pvs=4

const pageId = "d18d67a9-40fb-4a99-9be3-b055513a5ada"
const apiKey = "secret_Hfzzy4S7f5iismEFKzlBvcnJBX2JXMB7m4xP9iWPOTE"

const notion = new Client({auth: apiKey})

export const createBlock = async () => {
    const blockId = pageId
    const newBlockRes = await notion.blocks.children.append({
        block_id: blockId,
        children: [
            {
                type: "table",
                table: {
                    table_width: 90
                }
            }
        ]
    })
}

