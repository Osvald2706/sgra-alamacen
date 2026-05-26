from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class LoginRequest(BaseModel):
    username: str
    password: str


class RequestCreate(BaseModel):
    product_id: int
    quantity: int
    note: Optional[str] = ""


class RequestUpdate(BaseModel):
    status: str


class ProductCreate(BaseModel):
    name: str
    category: Optional[str] = "General"
