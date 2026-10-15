#!/usr/bin/env python3
"""Regenerate public Round3 RGB QR pixels from pinned synthetic source, check originals.
Only software-generated PNG images. Does not perform photon-storage or camera tests.
"""
from pathlib import Path
from io import BytesIO
import base64,hashlib,struct,json,sys
from PIL import Image
import qrcode
from pyzbar.pyzbar import decode as zbar_decode

SEED=b"ASOLARIA-LIGHT-BEING-ROUND3-20261015"
ROOT=Path(__file__).parent/"assets"
SOURCE_SHA="fe3f6f1adb2eb15832bd5d5fd59c2c97bc77b581c5c60f54b768545c756b38c4"
PIXEL_SHAS=[
"525e178e0904deca4f6a2f261b064d09d79ab88e8a34931ea90f1289abba6c85",
"e47800ca5d84582a926a7474d920b7390782398e750f44cd8cf56eeaf1dc705c",
"70900014ed52ef8ad114fed01427707ffd5f43b8607e09d8e6bfab381386707b",
"9dc9276236081ef07137f1334274d57cbc1afc8f819163303a8fe8dabae69375",
"fff7fafbb829a4c70c44569b1f1d8797c782a7103e9e82c63cc0c06ee60c96e9",
"c9c08ca26d1239b797292eaa5e9e654053559bb2b7feaf1906b9c3e8630997e8",
"e06c6a528b9135b68bc6afce6f397bfd0bc513cfdfd9683850915691f929d83a",
"10384ff05cd43b74e8e990aa0285118d6deb882a01cf6f249ce1280c4f341660",
"8a321793241de8f44a5f49a9930b0e29efbbeffb82f9dde98a712499fff738e3",
"e38400a852ac5ad6508bb2e128c8dc14417c1304a30e6c401a864e34c4730384",
"25bcbca01e496b81f112b131609ea3d78028d11fcc2021e22f758cde9d29cef9",
]
def sha(b):return hashlib.sha256(b).hexdigest()
def fixture():return b"".join(hashlib.sha256(SEED+struct.pack("<I",i)).digest() for i in range(2048))
def create():
    ROOT.mkdir(parents=True,exist_ok=True)
    payload=fixture()
    assert len(payload)==65536 and sha(payload)==SOURCE_SHA
    chunks=[struct.pack("<I",i)+payload[i*2100:(i+1)*2100] for i in range(32)]
    images=[];received=[]
    for frame in range(11):
        planes=[]
        for lane in range(3):
            pos=3*frame+lane
            if pos==32:
                plane=Image.new("L",(555,555),255)
            else:
                qr=qrcode.QRCode(version=40,error_correction=qrcode.constants.ERROR_CORRECT_L,box_size=3,border=4)
                qr.add_data(base64.b64encode(chunks[pos]).decode("ascii"),optimize=0)
                qr.make(fit=False)
                plane=qr.make_image(fill_color="black",back_color="white").convert("L")
            assert plane.size==(555,555)
            planes.append(plane)
        im=Image.merge("RGB",tuple(planes))
        assert sha(im.tobytes())==PIXEL_SHAS[frame],("Unexpected original-pixel mismatch",frame,sha(im.tobytes()))
        target=ROOT/f"round3-light-being-qr-{frame:02d}.png"
        im.save(target)
        saved=Image.open(target).convert("RGB")
        assert sha(saved.tobytes())==PIXEL_SHAS[frame]
        row={"file":target.name,"width":555,"height":555,"rgb_pixel_sha256":PIXEL_SHAS[frame],"png_sha256":sha(target.read_bytes()),"channels":[]}
        for lane in range(3):
            sep=Image.new("RGB",im.size,(255,255,255));sep=Image.merge("RGB",(planes[lane],)*3)
            result=zbar_decode(sep)
            if frame==10 and lane==2:
                assert len(result)==0
                row["channels"].append({"lane":"RGB"[lane],"status":"filler"})
                continue
            assert len(result)==1,(frame,lane,len(result))
            raw=base64.b64decode(result[0].data,validate=True)
            number=int.from_bytes(raw[:4],"little")
            assert number==3*frame+lane and raw==chunks[number]
            received.append((number,raw[4:]))
            row["channels"].append({"lane":"RGB"[lane],"index":number,"body_bytes":len(raw)-4,"status":"decoded"})
        images.append(row)
    assert len(received)==32
    rebuilt=b"".join(body for i,body in sorted(received))
    assert rebuilt==payload and sha(rebuilt)==SOURCE_SHA
    (ROOT/"round3-synthetic-fixture.bin").write_bytes(payload)
    manifest={"label":"PUBLIC SOFTWARE RGB QR DEMONSTRATION - NOT PHYSICAL PHOTON MEMORY",
      "source":"JesseBrown1980/asolaria-stone-to-moss PR #75",
      "original_peer":"Seat 2 PR #77 independent ZXing C++ audit",
      "date":"2026-10-15",
      "source_sha256":SOURCE_SHA,
      "bytes":len(payload),"composite_images":11,"decoded_qr_symbols":32,
      "rendered_and_redecoded":True,"real_camera":False,"physical_optical_retention":False,
      "image_artifacts":images}
    (ROOT/"manifest.json").write_text(json.dumps(manifest,indent=2,sort_keys=True)+"\n")
    print(json.dumps({"status":"PASS_PUBLIC_PNG_REPRODUCTION","original_pixels":11,
           "actual_qr_decode":32,"source_sha256":SOURCE_SHA,
           "frame_manifest_sha256":sha((ROOT/"manifest.json").read_bytes())},sort_keys=True))
if __name__=="__main__":create()
