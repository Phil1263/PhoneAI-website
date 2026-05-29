import os
import json
import time
import logging
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Response
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("PhoneAI")

# Load environment variables
load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "phoneai-bot")

# Optional LangSmith Tracing Setup
if os.getenv("LANGCHAIN_TRACING_V2") == "true":
    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGCHAIN_ENDPOINT"] = os.getenv("LANGCHAIN_ENDPOINT", "https://eu.api.smith.langchain.com")
    os.environ["LANGCHAIN_API_KEY"] = os.getenv("LANGCHAIN_API_KEY", "")
    os.environ["LANGCHAIN_PROJECT"] = os.getenv("LANGCHAIN_PROJECT", "PhoneAI_Project")

# Define tools
tools = []
retriever_ready = False

# Try to connect to Pinecone vector store
if OPENAI_API_KEY and PINECONE_API_KEY:
    try:
        from pinecone import Pinecone
        from langchain_pinecone import PineconeVectorStore
        from langchain_openai import OpenAIEmbeddings
        from langchain_core.tools import create_retriever_tool

        logger.info("Connecting to Pinecone index...")
        embeddings = OpenAIEmbeddings(
            model="text-embedding-ada-002",
            openai_api_key=OPENAI_API_KEY
        )
        pc = Pinecone(api_key=PINECONE_API_KEY)
        
        # Verify index exists
        existing_indexes = [idx["name"] for idx in pc.list_indexes()]
        if INDEX_NAME in existing_indexes:
            vectorstore = PineconeVectorStore.from_existing_index(
                index_name=INDEX_NAME,
                embedding=embeddings,
                text_key="text"
            )
            retriever = vectorstore.as_retriever(search_kwargs={"k": 6})
            
            tool_description = (
                "Use this tool to search for smartphone specs, reviews, and tech advice. "
                "Always use this tool when the user asks about smartphones, phone recommendations, or tech. "
                "Do NOT use this tool for general greetings, math calculations, or unrelated topics."
            )
            retriever_tool = create_retriever_tool(
                retriever,
                "smartphone_tech_database",
                tool_description
            )
            tools.append(retriever_tool)
            retriever_ready = True
            logger.info(f"Successfully integrated Pinecone index '{INDEX_NAME}'.")
        else:
            logger.warning(f"Pinecone index '{INDEX_NAME}' not found in active indexes. Falling back to local responder.")
    except Exception as e:
        logger.error(f"Failed to initialize Pinecone retriever: {e}. Falling back to local responder.")

if not retriever_ready:
    # Local fallback retriever if Pinecone is not yet configured or indexes are missing
    from langchain_core.tools import tool
    
    @tool
    def smartphone_tech_database(query: str) -> str:
        """
        Use this tool to search for smartphone specs, reviews, and tech advice.
        Always use this tool when the user asks about smartphones, phone recommendations, or tech.
        Do NOT use this tool for general greetings, math calculations, or unrelated topics.
        """
        logger.info(f"Local Fallback Retriever search for: '{query}'")
        q = query.lower()
        if "iphone 17" in q or "17 pro" in q:
            return (
                "[FALLBACK SPEC DATABASE] Apple iPhone 17 Pro Max (Release: Late 2025/2026):\n"
                "- Display: 6.9-inch LTPO Super Retina XDR OLED, 120Hz, HDR10, Dolby Vision\n"
                "- Chipset: Apple A19 Pro (3nm)\n"
                "- Memory: 12GB RAM (Optimized for Apple Intelligence)\n"
                "- Storage: 256GB / 512GB / 1TB\n"
                "- Cameras: 48MP (wide) + 48MP (5x periscope telephoto) + 48MP (ultrawide)\n"
                "- Battery: 4,852 mAh with 30W wired, 15W MagSafe wireless\n"
                "- OS: iOS 19"
            )
        elif "s26" in q or "galaxy s26" in q:
            return (
                "[FALLBACK SPEC DATABASE] Samsung Galaxy S26 Ultra (Release: Early 2026):\n"
                "- Display: 6.8-inch Dynamic LTPO AMOLED 2X, 144Hz, HDR10+, 2600 nits\n"
                "- Chipset: Snapdragon 8 Gen 5 (3nm) - Galaxy Edition\n"
                "- Memory: 12GB / 16GB RAM\n"
                "- Storage: 256GB / 512GB / 1TB\n"
                "- Cameras: 200MP (wide) + 50MP (5x optical periscope) + 50MP (3x optical) + 50MP (ultrawide)\n"
                "- Battery: 5,000 mAh with 45W wired, 15W wireless\n"
                "- OS: Android 16, One UI 8.0"
            )
        elif "pixel 10" in q or "pixel 10 pro" in q:
            return (
                "[FALLBACK SPEC DATABASE] Google Pixel 10 Pro XL (Release: Late 2025):\n"
                "- Display: 6.8-inch LTPO OLED, 120Hz, 3000 nits\n"
                "- Chipset: Google Tensor G5 (TSMC 3nm)\n"
                "- Memory: 16GB RAM\n"
                "- Cameras: 50MP (wide) + 48MP (5x telephoto) + 48MP (ultrawide)\n"
                "- Battery: 5,060 mAh with 37W wired\n"
                "- OS: Android 16, Gemini-Nano integrated directly on chip."
            )
        else:
            return (
                "[FALLBACK SPEC DATABASE] General Smartphone Tech Specs:\n"
                "- Mid-range values: Google Pixel 10a or Galaxy A57 represent the best value under 500€.\n"
                "- Flagship values: Galaxy S26 Ultra and iPhone 17 Pro Max lead camera rankings.\n"
                "- Battery specs: Look for silicone-carbon anode batteries (e.g. OnePlus, Xiaomi) for higher energy densities."
            )
            
    tools.append(smartphone_tech_database)
    logger.info("Local fallback retriever tool registered.")

# LangGraph Agent Initialization
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import create_react_agent

phone_ai_system_prompt = """You are 'PhoneAI', an elite and highly technical smartphone advisor.
Your primary directive is to guide users to the best smartphone choices.

CRITICAL INSTRUCTIONS YOU MUST FOLLOW:
1. Tool Usage: If the user asks about smartphones, specs, reviews, or recommendations, you MUST use the smartphone_tech_database tool to find answers.
2. Out-of-Domain Knowledge: If the user asks a general question (e.g., "Hello", math problems, history), do NOT use the tool. Answer directly using your internal knowledge.
3. Cross-Lingual Synthesis: Your knowledge base contains data in multiple languages. You must synthesize this data into the user's requested language.
4. Natural Conversational Tone: You are strictly forbidden from using robotic phrases like "Based on the tool" or "According to the database". Answer directly.
5. Honesty Limit: If the tool does not contain the answer to a smartphone question, simply state that you do not have the information. Do not hallucinate.
"""

llm = ChatOpenAI(
    openai_api_key=OPENAI_API_KEY or "dummy_key",
    model="gpt-4o-mini",
    temperature=0.0,
    streaming=True
)

memory = MemorySaver()
agent_executor = create_react_agent(
    model=llm,
    tools=tools,
    prompt=phone_ai_system_prompt,
    checkpointer=memory
)

# FastAPI App Setup
app = FastAPI(title="PhoneAI API", description="Backend API for PhoneAI Multimodal Chatbot")

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str
    thread_id: str

def stream_agent_response(message: str, thread_id: str):
    config = {"configurable": {"thread_id": thread_id}}
    try:
        from langchain_core.messages import HumanMessage
        
        tool_active = False
        
        # Stream messages from LangGraph (using synchronous stream to avoid Pinecone asyncio session conflicts)
        for chunk, metadata in agent_executor.stream(
            {"messages": [HumanMessage(content=message)]},
            config=config,
            stream_mode="messages"
        ):
            # Check agent execution
            if metadata.get("langgraph_node") == "agent":
                # Detect starting of tool execution
                tool_calls = getattr(chunk, "tool_calls", [])
                tool_call_chunks = getattr(chunk, "tool_call_chunks", [])
                if (tool_calls or tool_call_chunks) and not tool_active:
                    tool_active = True
                    tool_name = "smartphone_tech_database"
                    if tool_calls:
                        tool_name = tool_calls[0].get("name", tool_name)
                    elif tool_call_chunks:
                        tool_name = tool_call_chunks[0].get("name", tool_name)
                    yield f"data: {json.dumps({'type': 'tool_start', 'name': tool_name})}\n\n"
                
                # Stream standard generated text
                if chunk.content and isinstance(chunk.content, str):
                    yield f"data: {json.dumps({'type': 'token', 'content': chunk.content})}\n\n"
                    
            elif metadata.get("langgraph_node") == "tools":
                if hasattr(chunk, "content") and chunk.content:
                    tool_active = False
                    tool_name = getattr(chunk, "name", "smartphone_tech_database")
                    yield f"data: {json.dumps({'type': 'tool_end', 'name': tool_name})}\n\n"

        yield f"data: {json.dumps({'type': 'done'})}\n\n"
    except Exception as e:
        logger.exception("Error during LLM streaming")
        yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

# API Endpoints
@app.post("/api/chat")
def chat_endpoint(request: ChatRequest):
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API Key is not configured on the server. Please check your .env file.")
    return StreamingResponse(
        stream_agent_response(request.message, request.thread_id),
        media_type="text/event-stream"
    )

@app.post("/api/stt")
async def speech_to_text(file: UploadFile = File(...)):
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API Key is not configured on the server.")
    
    # Write incoming file to temporary path
    temp_dir = os.path.join(os.getcwd(), "temp_audio")
    os.makedirs(temp_dir, exist_ok=True)
    
    file_extension = os.path.splitext(file.filename)[1] if file.filename else ".webm"
    if not file_extension:
        file_extension = ".webm"
        
    temp_filepath = os.path.join(temp_dir, f"recording_{int(time.time())}{file_extension}")
    
    try:
        with open(temp_filepath, "wb") as f:
            content = await file.read()
            f.write(content)
            
        from openai import OpenAI
        client = OpenAI(api_key=OPENAI_API_KEY)
        
        with open(temp_filepath, "rb") as audio_file:
            transcript = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file
            )
        return {"text": transcript.text}
    except Exception as e:
        logger.error(f"STT Error: {e}")
        raise HTTPException(status_code=500, detail=f"Speech-to-Text transcription failed: {str(e)}")
    finally:
        if os.path.exists(temp_filepath):
            try:
                os.remove(temp_filepath)
            except Exception as ex:
                logger.error(f"Could not remove temp file: {ex}")

class TTSRequest(BaseModel):
    text: str

@app.post("/api/tts")
async def text_to_speech(request: TTSRequest):
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API Key is not configured on the server.")
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
        
    try:
        from openai import OpenAI
        client = OpenAI(api_key=OPENAI_API_KEY)
        
        response = client.audio.speech.create(
            model="tts-1",
            voice="alloy",
            input=request.text
        )
        return Response(content=response.content, media_type="audio/mpeg")
    except Exception as e:
        logger.error(f"TTS Error: {e}")
        raise HTTPException(status_code=500, detail=f"Text-to-Speech synthesis failed: {str(e)}")

# Mount Static Files & Serve index.html at root
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def serve_index():
    return FileResponse("static/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
